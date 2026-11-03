// Imported as a URL: a plain CSS import would be hoisted by Astro into a
// render-blocking stylesheet on every page.
import { DEPTH, POINTER_REACH, getBodies } from "./bodies";
import stylesUrl from "./cosmos.css?url";
import { landRocket, launchRocket } from "./launch";
import { createSpaceMusic } from "./music";
import { createNebula } from "./nebula";
import { createStarfield } from "./starfield";
import { createSkyEffects, createStars } from "./stars";

// Self-hosted by fontless, which also gives them metric-matched fallbacks.
// Loading them up front means the switch never shows a font swap.
const FONTS = ['400 1em "Exo 2"', '600 1em "Exo 2"', '400 1em "Audiowide"'];
const FONTS_TIMEOUT_MS = 1500;
const STILL_CLASS = "cosmos-still";
const STILL_KEY = "spaceStill";
// Slow motion (twinkling, the spinning planet) renders at 30 fps; scrolling,
// the pointer, shooting stars and the warp get every frame. Idle frames are
// skipped with a timer rather than an early return, because every animation
// frame the page asks for also makes the browser tick all CSS animations.
const IDLE_FRAME_MS = 1000 / 30;
const ACTIVE_FOR_MS = 250;
const POINTER_LINGER_S = 2.5;
// Longer gaps between frames, like a tab in the background, do not move the
// sky any further than this, so it never jumps ahead.
const MAX_FRAME_S = 0.1;
const SETTLE = { duration: 1200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const WARP_MS = { arrival: 2400 } as const;
// Keep in sync with the drifting elements in `cosmos.css`.
const DRIFT_SELECTOR = [
  ".action-link",
  ".back-link",
  ".book-item",
  ".card-link",
  ".fallback",
  ".hex",
  ".honor-card",
  ".list",
  ".skill-chip",
  ".timeline-row > .card-container",
  ".year-watermark",
].join(",");
// Everything the pause button stops: the drift and the hero's own motion.
const PAUSABLE_SELECTOR = `${DRIFT_SELECTOR},.logo-wrapper`;

const styles = loadStylesheet(stylesUrl);
let fonts: Promise<unknown> | undefined;
let scene: Scene | undefined;

/** Fetches the fonts and styles ahead of time, so switching never waits. */
export function prepare() {
  fonts ??= loadFonts();
  return Promise.all([styles, fonts]);
}

/**
 * Mounts the space scene once its styles are in. Calling it again while
 * mounted only adds the warp.
 */
export async function start(options?: StartOptions) {
  void prepare();
  await styles;
  // The theme may have been switched away while the styles were loading.
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
 * Lifts a rocket off from the given element into space. `onSwitch` applies the
 * theme once the sky covers the page; without motion it applies right away.
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
    // The first flight builds up slowly after the countdown; later ones are
    // eager to go.
    ignitionMs: options?.isFirstFlight ? 700 : 380,
    onSwitch: () => {
      onSwitch();
      void start({ warp: "arrival" });
    },
  });
}

/**
 * Brings the rocket back down onto the given element. `onSwitch` applies the
 * new theme while space covers the page; without motion it applies right away.
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
  // The body is replaced on every client-side navigation, so watch the root.
  driftObserver.observe(root, { childList: true, subtree: true });

  const pointer = { strength: 0, x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  const view = { x: 0, y: 0 };
  let lastPointerMove = -Infinity;
  let lastScroll = -Infinity;
  let lastFrame = performance.now();
  // The sky's own time, which stands still while paused. Resuming carries on
  // from the same moment, so nothing jumps.
  let motionTime = 0;
  let frame = 0;
  let idleTimer = 0;
  let isAsleep = false;
  let warpStart = 0;
  let warpDuration = 0;
  let isDestroyed = false;
  let driftFrame = 0;

  function isPaused() {
    return root.classList.contains(STILL_CLASS);
  }

  function isStill() {
    return reducedMotion.matches || isPaused();
  }

  /** Draws one frame and tells whether anything is moving fast. */
  function render(now: number) {
    const time = now / 1000;
    const still = isStill();
    // Motion-free visitors get the sky at rest. A paused sky still follows
    // the page while scrolling, like the rest of the parallax.
    const isFixed = reducedMotion.matches;
    if (!still) motionTime += Math.min(MAX_FRAME_S, (now - lastFrame) / 1000);
    lastFrame = now;
    const warpProgress = warpDuration ? (now - warpStart) / warpDuration : 1;
    const warpStrength =
      still || warpProgress >= 1 ? 0 : (1 - warpProgress) ** 2.2;
    if (warpProgress >= 1) warpDuration = 0;

    const viewTarget = still ? { x: 0, y: 0 } : pointerTarget;
    const isActive =
      !isFixed &&
      (warpStrength > 0 ||
        now - lastScroll < ACTIVE_FOR_MS ||
        now - lastPointerMove * 1000 < ACTIVE_FOR_MS ||
        Math.abs(view.x - viewTarget.x) + Math.abs(view.y - viewTarget.y) >
          0.002 ||
        Boolean(effects?.hasShootingStar()) ||
        // A paused sky only draws while the pointer's glow fades out.
        (still && pointer.strength > 0));

    // Pausing lets the view drift back to the centre instead of snapping.
    const smoothing = isFixed ? 1 : 0.08;
    view.x += (viewTarget.x - view.x) * smoothing;
    view.y += (viewTarget.y - view.y) * smoothing;
    pointer.strength = isFixed
      ? 0
      : Math.max(0, Math.min(1, POINTER_LINGER_S - (time - lastPointerMove)));
    const scroll = isFixed ? 0 : window.scrollY;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const bodies = getBodies({
      arrival: warpStrength,
      height,
      pointer: view,
      scroll,
      time: motionTime,
      width,
    });

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
    starfield?.draw({
      // Paused stars keep the twinkle they had, motion-free ones are even.
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
    // A still sky has nothing left to draw until it is scrolled or resized.
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
    const stars = createStars(width, height);
    nebula?.resize(width, height, pixelRatio);
    starfield?.resize(width, height, pixelRatio, stars);
    effects?.resize(width, height, pixelRatio, stars);
    wake();
  }

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
    if (reducedMotion.matches) return;
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
  // while the tab is in the background.
  function syncMusic() {
    if (isPaused() || document.hidden) music.pause();
    else music.play();
  }

  function destroy() {
    isDestroyed = true;
    cancelAnimationFrame(driftFrame);
    driftObserver.disconnect();
    window.removeEventListener("resize", resize);
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
    // Let the fade-out finish before tearing down the canvases.
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

// Every drifting element gets its own pace and phase so the page floats
// instead of swaying in lockstep.
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

// WCAG 2.2.2 and 1.4.2: motion longer than five seconds and audio that plays
// on its own both need a way to pause them.
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
    // Read where everything is before the animations stop.
    const settle = isPaused ? captureMotion() : restartMotionAtRest;
    apply(isPaused);
    settle();
    writeStorage(STILL_KEY, String(isPaused));
    button.dispatchEvent(new Event("toggle"));
  });
  getMount().append(button);

  return button;
}

/**
 * Notes where every floating element is, and returns how to ease them from
 * there back into their resting place once their animations have stopped.
 */
function captureMotion() {
  if (prefersReducedMotion()) return () => {};
  const poses = [
    ...document.querySelectorAll<HTMLElement>(PAUSABLE_SELECTOR),
  ].flatMap((element) => {
    const { transform } = getComputedStyle(element);
    return transform === "none" ? [] : [{ element, transform }];
  });

  return () => {
    for (const { element, transform } of poses) {
      element.animate([{ transform }, { transform: "none" }], SETTLE);
    }
  };
}

// Starts every loop again at the point where it passes its resting place, so
// it sets off from where it lies instead of jumping into its old phase.
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

// The `#cosmos` element persists across client-side navigations, so whatever
// lives in it keeps running from page to page.
function getMount() {
  return document.getElementById("cosmos") ?? document.body;
}

function loadStylesheet(href: string) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  // The client router drops head elements the next page does not have. A copy
  // in the incoming head makes it keep this one instead.
  document.addEventListener("astro:before-swap", (event) => {
    event.newDocument.head.append(link.cloneNode());
  });

  return new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    // Without the styles the scene would render unpositioned, but the theme
    // itself still works, so carry on rather than reject.
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.append(link);
  });
}

function loadFonts() {
  const timeout = new Promise((resolve) =>
    setTimeout(resolve, FONTS_TIMEOUT_MS)
  );
  const loaded = Promise.all(FONTS.map((font) => document.fonts.load(font)));
  // A slow font only means a late swap, never a stuck switch.
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
    // Pausing still works for this visit without storage.
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
