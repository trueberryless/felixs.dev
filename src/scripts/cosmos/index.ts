// Imported as a URL, since Astro would hoist a plain CSS import into a
// render-blocking stylesheet on every page.
import { DEPTH, POINTER_REACH, getBodies } from "./bodies";
import stylesUrl from "./cosmos.css?url";
import { landRocket, launchRocket } from "./launch";
import { createSpaceMusic, prepareMusic } from "./music";
import { createNebula } from "./nebula";
import { createStarfield } from "./starfield";
import { createSkyEffects, createStars } from "./stars";

// Self-hosted by fontless with metric-matched fallbacks. Preloaded, so the
// switch never shows a font swap.
const FONTS = ['400 1em "Exo 2"', '600 1em "Exo 2"', '400 1em "Audiowide"'];
const FONTS_TIMEOUT_MS = 1500;
const STILL_CLASS = "cosmos-still";
const STILL_KEY = "spaceStill";
// Slow motion (twinkling, the spinning planet) runs at 30 fps, while scrolling,
// the pointer, shooting stars and the warp get every frame. Idle frames are
// skipped with a timer, since every requested frame also ticks CSS animations.
const IDLE_FRAME_MS = 1000 / 30;
// The fog and planet move slowly, so on their own they redraw every few frames.
const IDLE_NEBULA_MS = 1000 / 10;
// Stars and effects stay sharp at this density, and every pixel counts on big
// screens.
const MAX_STAR_PIXEL_RATIO = 1.5;
const ACTIVE_FOR_MS = 250;
const POINTER_LINGER_S = 2.5;
// Caps the step after long gaps like a background tab, so the sky never jumps.
const MAX_FRAME_S = 0.1;
const SETTLE = { duration: 1200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
// The longest the easing waits for restarted animations to take effect.
const SETTLE_WAIT_MS = 100;
const WARP_MS = { arrival: 2400 } as const;
// Keep in sync with the drifting elements in `cosmos.css`.
const DRIFT_SELECTOR = [
  ".action-link",
  ".back-link",
  ".book-item",
  ".card-link",
  ".fallback",
  ".filter-chip",
  ".hex",
  ".number-card",
  ".timeline-row > .card-container",
  ".year-watermark",
].join(",");
// Everything the pause button stops: the drift, the hero's motion and the
// parallax of the hero, blog years and footer.
const PAUSABLE_SELECTOR = [
  DRIFT_SELECTOR,
  ".footer-container",
  ".logo-wrapper",
  ".parallax",
  ".year-depth",
].join(",");

const styles = loadStylesheet(stylesUrl);
// The easing each element is still running from the last toggle.
const settling = new WeakMap<Element, Animation>();
let fonts: Promise<unknown> | undefined;
let warm: Promise<void> | undefined;
let scene: Scene | undefined;
// Decoded prints stay referenced, so the browser keeps them ready.
const prints: HTMLImageElement[] = [];

/**
 * Fetches fonts and styles and does the slow first-time work ahead, so
 * switching never waits. The countdown calls it before liftoff.
 */
export function prepare() {
  fonts ??= loadFonts();
  warm ??= warmUp();
  return Promise.all([styles, fonts, warm]);
}

/**
 * Compiles the shaders, which the GPU keeps, and decodes the planet prints,
 * so neither stalls the rocket mid-launch.
 */
async function warmUp() {
  // One step per idle moment, so none of them stalls the countdown.
  await idle();
  prepareMusic();
  for (const create of [createNebula, createStarfield]) {
    await idle();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    create(canvas)?.destroy();
  }
  await Promise.all(decodePrints());
}

function idle() {
  return new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => resolve(), { timeout: 400 });
    } else setTimeout(resolve, 0);
  });
}

function decodePrints() {
  return [...document.querySelectorAll<HTMLElement>("[data-planet]")].map(
    async (element) => {
      const url = /url\(["']?([^"')]+)/.exec(
        element.style.getPropertyValue("--planet-print")
      )?.[1];
      if (!url) return;
      const image = new Image();
      image.src = url;
      prints.push(image);
      // A print that fails to load shows without its logo.
      await image.decode().catch(() => {});
    }
  );
}

/**
 * Mounts the scene once its styles are in. While mounted, only adds the warp.
 */
export async function start(options?: StartOptions) {
  void prepare();
  await styles;
  // The theme may have changed while the styles loaded.
  if (!document.documentElement.classList.contains("space")) return;

  scene ??= createScene();
  if (options?.warp) scene.warp(WARP_MS[options.warp]);
}

/** Fades the scene out and releases its canvases and listeners. */
export function stop() {
  scene?.destroy();
  scene = undefined;
}

/**
 * Launches a rocket from the element into space. `onSwitch` applies the theme
 * once the sky covers the page, or right away without motion.
 */
export async function launch(
  from: Element | null,
  onSwitch: () => void,
  options?: LaunchOptions
) {
  const ready = prepare();
  await styles;
  if (prefersReducedMotion()) {
    onSwitch();
    return;
  }
  await launchRocket(from, {
    beforeReveal: ready,
    // The first flight after the countdown builds up slowly, later ones go
    // eagerly.
    ignitionMs: options?.isFirstFlight ? 700 : 380,
    onSwitch: () => {
      onSwitch();
      void start({ warp: "arrival" });
    },
  });
}

/**
 * Lands the rocket on the element. `onSwitch` applies the theme while space
 * covers the page, or right away without motion.
 */
export async function land(to: Element | null, onSwitch: () => void) {
  await styles;
  if (prefersReducedMotion()) {
    onSwitch();
    return;
  }
  await landRocket(to, { onSwitch });
}

function createScene(): Scene {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const layer = document.createElement("div");
  layer.className = "cosmos-layer";
  layer.setAttribute("aria-hidden", "true");
  const nebulaCanvas = document.createElement("canvas");
  const starCanvas = document.createElement("canvas");
  const effectsCanvas = document.createElement("canvas");
  layer.append(nebulaCanvas, starCanvas, effectsCanvas);
  getMount().prepend(layer);

  const nebula = createNebula(nebulaCanvas);
  if (!nebula) nebulaCanvas.remove();
  const starfield = createStarfield(starCanvas);
  if (!starfield) starCanvas.remove();
  const effects = createSkyEffects(effectsCanvas);
  const stillToggle = createStillToggle(root);
  const music = createSpaceMusic();
  const driftObserver = new MutationObserver(scheduleDriftPhases);
  // Client-side navigation replaces the body, so observe the root.
  driftObserver.observe(root, { childList: true, subtree: true });

  const pointer = { strength: 0, x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  const view = { x: 0, y: 0 };
  let lastPointerMove = -Infinity;
  let lastScroll = -Infinity;
  let lastFrame = performance.now();
  let lastNebulaFrame = -Infinity;
  // Read on resize, since reading it every frame could force a layout.
  let scrollMax = 0;
  // The sky's own clock, which stops while paused so resuming never jumps.
  let motionTime = 0;
  let frame = 0;
  let idleTimer = 0;
  let isAsleep = false;
  let warpStart = 0;
  let warpDuration = 0;
  let isDestroyed = false;
  let driftFrame = 0;
  // How much of the scroll the sky follows. Pausing glides it back to rest,
  // resuming catches up.
  let scrollShare = isStill() ? 0 : 1;

  function isPaused() {
    return root.classList.contains(STILL_CLASS);
  }

  function isStill() {
    return reducedMotion.matches || isPaused();
  }

  /** Draws one frame and returns whether anything moves fast. */
  function render(now: number) {
    const time = now / 1000;
    const still = isStill();
    // Reduced motion rests the sky at once, pausing eases it there.
    const isFixed = reducedMotion.matches;
    if (!still) motionTime += Math.min(MAX_FRAME_S, (now - lastFrame) / 1000);
    lastFrame = now;
    const warpProgress = warpDuration ? (now - warpStart) / warpDuration : 1;
    const warpStrength =
      still || warpProgress >= 1 ? 0 : (1 - warpProgress) ** 2.2;
    if (warpProgress >= 1) warpDuration = 0;

    const viewTarget = still ? { x: 0, y: 0 } : pointerTarget;
    const scrollShareTarget = still ? 0 : 1;
    const isActive =
      !isFixed &&
      (warpStrength > 0 ||
        now - lastScroll < ACTIVE_FOR_MS ||
        now - lastPointerMove * 1000 < ACTIVE_FOR_MS ||
        Math.abs(view.x - viewTarget.x) + Math.abs(view.y - viewTarget.y) >
          0.002 ||
        Math.abs(scrollShare - scrollShareTarget) > 0.001 ||
        Boolean(effects?.hasShootingStar()) ||
        // A paused sky only draws while the pointer's glow fades.
        (still && pointer.strength > 0));

    // Pausing drifts the view back to the centre instead of snapping.
    const smoothing = isFixed ? 1 : 0.08;
    view.x += (viewTarget.x - view.x) * smoothing;
    view.y += (viewTarget.y - view.y) * smoothing;
    scrollShare += (scrollShareTarget - scrollShare) * smoothing;
    if (Math.abs(scrollShare - scrollShareTarget) <= 0.001) {
      scrollShare = scrollShareTarget;
    }
    pointer.strength = isFixed
      ? 0
      : Math.max(0, Math.min(1, POINTER_LINGER_S - (time - lastPointerMove)));
    const scroll = window.scrollY * scrollShare;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const bodies = getBodies({
      arrival: warpStrength,
      height,
      pointer: view,
      scroll,
      scrollMax,
      time: motionTime,
      width,
    });

    if (isActive || now - lastNebulaFrame >= IDLE_NEBULA_MS) {
      lastNebulaFrame = now;
      nebula?.draw({
        bodies,
        dim: Math.min(1, scroll / height) * 0.2,
        nebulaOffset: {
          x: view.x * DEPTH.nebula * POINTER_REACH,
          y: view.y * DEPTH.nebula * POINTER_REACH + scroll * DEPTH.nebula,
        },
        time: motionTime,
        warp: warpStrength,
      });
    }
    starfield?.draw({
      // Paused stars keep their twinkle, reduced-motion ones are even.
      animate: !isFixed,
      bodies,
      scroll,
      time: motionTime,
      view,
      warp: warpStrength,
    });
    effects?.draw({
      animate: !still,
      bodies,
      pointer,
      scroll,
      time: motionTime,
      view,
      warp: warpStrength,
    });

    return isActive;
  }

  function loop(now: number) {
    if (render(now)) {
      frame = requestAnimationFrame(loop);
      return;
    }
    // A still sky has nothing to draw until it resizes.
    if (isStill()) {
      isAsleep = true;
      return;
    }
    idleTimer = window.setTimeout(() => {
      idleTimer = 0;
      frame = requestAnimationFrame(loop);
    }, IDLE_FRAME_MS - 4);
  }

  // Scrolling, the pointer and the warp need every frame right away.
  function wake() {
    if (!idleTimer && !isAsleep) return;
    clearTimeout(idleTimer);
    idleTimer = 0;
    isAsleep = false;
    frame = requestAnimationFrame(loop);
  }

  function play() {
    cancelAnimationFrame(frame);
    clearTimeout(idleTimer);
    idleTimer = 0;
    isAsleep = false;
    if (isDestroyed) return;
    lastFrame = performance.now();
    frame = requestAnimationFrame(loop);
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const starPixelRatio = Math.min(pixelRatio, MAX_STAR_PIXEL_RATIO);
    const stars = createStars(width, height);
    nebula?.resize(width, height, pixelRatio);
    starfield?.resize(width, height, starPixelRatio, stars);
    effects?.resize(width, height, starPixelRatio, stars);
    measurePage();
  }

  // Runs after layout, so reading the height is free here.
  function measurePage() {
    scrollMax = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    wake();
  }
  const pageSize = new ResizeObserver(measurePage);
  pageSize.observe(document.documentElement);

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse" || isStill()) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointerTarget.x = event.clientX / window.innerWidth - 0.5;
    pointerTarget.y = event.clientY / window.innerHeight - 0.5;
    lastPointerMove = performance.now() / 1000;
    wake();
  }

  function onClick(event: MouseEvent) {
    if (isStill()) return;
    effects?.fireShot(event.clientX, event.clientY, motionTime);
    wake();
  }

  function onScroll() {
    if (isStill()) return;
    lastScroll = performance.now();
    wake();
  }

  function scheduleDriftPhases() {
    cancelAnimationFrame(driftFrame);
    driftFrame = requestAnimationFrame(setDriftPhases);
  }

  function warp(duration: number) {
    if (isStill()) return;
    warpStart = performance.now();
    warpDuration = duration;
    wake();
  }

  // The music follows the pause button, not the motion preference, and rests
  // in background tabs.
  function syncMusic() {
    if (isPaused() || document.hidden) music.pause();
    else music.play();
  }

  function destroy() {
    isDestroyed = true;
    cancelAnimationFrame(driftFrame);
    driftObserver.disconnect();
    window.removeEventListener("resize", resize);
    pageSize.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("click", onClick);
    reducedMotion.removeEventListener("change", play);
    stillToggle.removeEventListener("toggle", play);
    stillToggle.removeEventListener("toggle", syncMusic);
    document.removeEventListener("visibilitychange", syncMusic);
    music.destroy();
    stillToggle.remove();
    root.classList.remove(STILL_CLASS);
    layer.classList.remove("is-visible");
    // Let the fade-out finish before tearing down.
    setTimeout(() => {
      cancelAnimationFrame(frame);
      clearTimeout(idleTimer);
      nebula?.destroy();
      starfield?.destroy();
      layer.remove();
    }, 900);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("click", onClick, { passive: true });
  reducedMotion.addEventListener("change", play);
  stillToggle.addEventListener("toggle", play);
  stillToggle.addEventListener("toggle", syncMusic);
  document.addEventListener("visibilitychange", syncMusic);

  setDriftPhases();
  resize();
  render(performance.now());
  play();
  requestAnimationFrame(() => layer.classList.add("is-visible"));
  syncMusic();

  return { destroy, warp };
}

// Each drifting element gets its own pace and phase, so nothing sways in
// lockstep.
function setDriftPhases() {
  for (const element of document.querySelectorAll<HTMLElement>(
    DRIFT_SELECTOR
  )) {
    if (element.style.getPropertyValue("--drift-delay")) continue;
    const duration = 16 + Math.random() * 12;
    element.style.setProperty("--drift-duration", `${duration.toFixed(2)}s`);
    element.style.setProperty(
      "--drift-delay",
      `${(-Math.random() * duration).toFixed(2)}s`
    );
  }
}

// WCAG 2.2.2 and 1.4.2: long motion and autoplaying audio need a pause control.
function createStillToggle(root: HTMLElement) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cosmos-still-toggle";
  button.title = "Pause space motion and music";
  button.innerHTML = [
    '<svg class="cosmos-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    '<svg class="cosmos-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>',
    '<span class="cosmos-visually-hidden">Pause space motion and music</span>',
  ].join("");

  function apply(isPaused: boolean) {
    root.classList.toggle(STILL_CLASS, isPaused);
    button.setAttribute("aria-pressed", String(isPaused));
    button.title = isPaused
      ? "Resume space motion and music"
      : "Pause space motion and music";
  }

  apply(readStorage(STILL_KEY) === "true");
  button.addEventListener("click", () => {
    const isPaused = !root.classList.contains(STILL_CLASS);
    // Read positions before the animations stop or restart.
    const settle = captureMotion();
    if (!isPaused) restartMotionAtRest();
    apply(isPaused);
    // Waits for the parallax fallback, which reacts in its own microtask.
    queueMicrotask(() => void settle());
    writeStorage(STILL_KEY, String(isPaused));
    button.dispatchEvent(new Event("toggle"));
  });
  getMount().append(button);

  return button;
}

/**
 * Records where every moving element is, and returns how to ease them to
 * where they belong once motion stops or starts.
 */
function captureMotion() {
  if (prefersReducedMotion()) return async () => {};
  const elements = [
    ...document.querySelectorAll<HTMLElement>(PAUSABLE_SELECTOR),
  ];
  const before = elements.map(readPose);

  return async () => {
    // Cancel first, so reading the new poses restyles only once.
    for (const element of elements) settling.get(element)?.cancel();
    // Restarted scroll-driven animations take effect a frame or so later, so
    // hold each element in place until then to avoid a jump.
    const isReady = Promise.all(
      elements.flatMap((element) =>
        element.getAnimations().map((animation) => animation.ready)
      )
    );
    const holds = elements.map((element, index) =>
      element.animate([before[index] ?? {}], {
        duration: SETTLE_WAIT_MS * 2,
        fill: "forwards",
      })
    );
    await Promise.race([
      isReady,
      new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS)),
    ]);
    for (const hold of holds) hold.cancel();

    for (const [index, element] of elements.entries()) {
      const from = before[index];
      const to = readPose(element);
      if (
        !from ||
        (from.transform === to.transform && from.translate === to.translate)
      ) {
        continue;
      }
      // Added on top of the current motion, so the parallax keeps following the
      // scroll while the gap closes.
      const offset = new DOMMatrix(to.transform)
        .inverse()
        .multiply(new DOMMatrix(from.transform));
      const shift = parseTranslate(from.translate).map(
        (value, axis) =>
          `${value - (parseTranslate(to.translate)[axis] ?? 0)}px`
      );
      const animation = element.animate(
        [
          { transform: offset.toString(), translate: shift.join(" ") },
          { transform: "none", translate: "0px" },
        ],
        { ...SETTLE, composite: "add" }
      );
      settling.set(element, animation);
    }
  };
}

function readPose(element: Element) {
  const { transform, translate } = getComputedStyle(element);
  return { transform, translate };
}

function parseTranslate(value: string) {
  const [x = 0, y = 0, z = 0] =
    value === "none" ? [] : value.split(" ").map(Number.parseFloat);
  return [x, y, z];
}

// Restarts each loop where it passes its resting place, so it sets off from
// where it lies.
function restartMotionAtRest() {
  for (const element of document.querySelectorAll<HTMLElement>(
    DRIFT_SELECTOR
  )) {
    const duration = Number.parseFloat(
      element.style.getPropertyValue("--drift-duration")
    );
    if (!duration) continue;
    const restingAt = Math.random() < 0.5 ? 0.25 : 0.75;
    element.style.setProperty(
      "--drift-delay",
      `${(-restingAt * duration).toFixed(2)}s`
    );
  }
  // The hero's logos rest where their bobbing begins.
  for (const element of document.querySelectorAll<HTMLElement>(
    ".logo-wrapper"
  )) {
    element.style.animationDelay = "0s";
  }
}

// `#cosmos` persists across client-side navigations, so its contents keep
// running.
function getMount() {
  return document.getElementById("cosmos") ?? document.body;
}

function loadStylesheet(href: string) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  // The router drops head elements the next page lacks, so copy this one into
  // the incoming head.
  document.addEventListener("astro:before-swap", (event) => {
    event.newDocument.head.append(link.cloneNode());
  });

  return new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    // Without the styles the scene is unpositioned, but the theme still works.
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.append(link);
  });
}

function loadFonts() {
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, FONTS_TIMEOUT_MS)
  );
  const loaded = Promise.all(FONTS.map((font) => document.fonts.load(font)));
  // A slow font only swaps late, it never blocks the switch.
  return Promise.race([loaded.catch(() => undefined), timeout]);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage, pausing still works for this visit.
  }
}

interface Scene {
  destroy: () => void;
  warp: (duration: number) => void;
}

interface LaunchOptions {
  isFirstFlight?: boolean;
}

interface StartOptions {
  warp?: keyof typeof WARP_MS;
}
