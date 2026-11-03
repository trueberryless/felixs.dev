// Imported as a URL: a plain CSS import would be hoisted by Astro into a
// render-blocking stylesheet on every page.
import { DEPTH, POINTER_REACH, getBodies } from "./bodies";
import stylesUrl from "./cosmos.css?url";
import { launchRocket } from "./launch";
import { createNebula } from "./nebula";
import { createStarfield } from "./starfield";
import { createSkyEffects, createStars } from "./stars";

const FONTS_ID = "celestial-fonts";
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap";
const STILL_CLASS = "cosmos-still";
const STILL_KEY = "celestialStill";
// Slow motion (twinkling, the spinning planet) renders at 30 fps; scrolling,
// the pointer, shooting stars and the warp get every frame. Idle frames are
// skipped with a timer rather than an early return, because every animation
// frame the page asks for also makes the browser tick all CSS animations.
const IDLE_FRAME_MS = 1000 / 30;
const ACTIVE_FOR_MS = 250;
const POINTER_LINGER_S = 2.5;
const WARP_MS = { arrival: 2400, cruise: 1300 } as const;
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

const styles = loadStylesheet(stylesUrl);
let scene: Scene | undefined;

/** Fetches the fonts and styles ahead of time, so switching never waits. */
export function prepare() {
  ensureFonts();
  return styles;
}

/**
 * Mounts the space scene once its styles are in. Calling it again while
 * mounted only adds the warp.
 */
export async function start(options?: StartOptions) {
  await prepare();
  // The theme may have been switched away while the styles were loading.
  if (!document.documentElement.classList.contains("celestial")) return;

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
export async function launch(from: Element | null, onSwitch: () => void) {
  await prepare();
  if (prefersReducedMotion()) {
    onSwitch();
    return;
  }
  await launchRocket(from, () => {
    onSwitch();
    void start({ warp: "arrival" });
  });
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
  document.body.prepend(layer);

  const nebula = createNebula(nebulaCanvas);
  if (!nebula) nebulaCanvas.remove();
  const starfield = createStarfield(starCanvas);
  if (!starfield) starCanvas.remove();
  const effects = createSkyEffects(effectsCanvas);
  const stillToggle = createStillToggle(root);
  const driftObserver = new MutationObserver(scheduleDriftPhases);
  driftObserver.observe(document.body, { childList: true, subtree: true });

  const pointer = { strength: 0, x: 0, y: 0 };
  const pointerTarget = { x: 0, y: 0 };
  const view = { x: 0, y: 0 };
  let lastPointerMove = -Infinity;
  let lastScroll = -Infinity;
  let frame = 0;
  let idleTimer = 0;
  let warpStart = 0;
  let warpDuration = 0;
  let isDestroyed = false;
  let driftFrame = 0;

  function isStill() {
    return reducedMotion.matches || root.classList.contains(STILL_CLASS);
  }

  /** Draws one frame and tells whether anything is moving fast. */
  function render(now: number) {
    const time = now / 1000;
    const still = isStill();
    const warpProgress = warpDuration ? (now - warpStart) / warpDuration : 1;
    const warpStrength =
      still || warpProgress >= 1 ? 0 : (1 - warpProgress) ** 2.2;
    if (warpProgress >= 1) warpDuration = 0;

    const isActive =
      warpStrength > 0 ||
      now - lastScroll < ACTIVE_FOR_MS ||
      now - lastPointerMove * 1000 < ACTIVE_FOR_MS ||
      Math.abs(view.x - pointerTarget.x) + Math.abs(view.y - pointerTarget.y) >
        0.002 ||
      Boolean(effects?.hasShootingStar());

    const smoothing = still ? 1 : 0.08;
    view.x += ((still ? 0 : pointerTarget.x) - view.x) * smoothing;
    view.y += ((still ? 0 : pointerTarget.y) - view.y) * smoothing;
    pointer.strength = still
      ? 0
      : Math.max(0, Math.min(1, POINTER_LINGER_S - (time - lastPointerMove)));
    const scroll = still ? 0 : window.scrollY;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const motionTime = still ? 0 : time;
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
      animate: !still,
      bodies,
      scroll,
      time,
      view,
      warp: warpStrength,
    });
    effects?.draw({
      animate: !still,
      bodies,
      pointer,
      scroll,
      time,
      view,
      warp: warpStrength,
    });

    return !still && isActive;
  }

  function loop(now: number) {
    if (render(now)) {
      frame = requestAnimationFrame(loop);
      return;
    }
    idleTimer = window.setTimeout(() => {
      idleTimer = 0;
      frame = requestAnimationFrame(loop);
    }, IDLE_FRAME_MS - 4);
  }

  // Scrolling, the pointer and the warp need every frame right away.
  function wake() {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = 0;
    frame = requestAnimationFrame(loop);
  }

  // Motion-free visitors get one carefully painted frame instead of a loop.
  function play() {
    cancelAnimationFrame(frame);
    clearTimeout(idleTimer);
    idleTimer = 0;
    if (isDestroyed) return;
    if (isStill()) {
      frame = requestAnimationFrame(render);
      return;
    }
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
    if (isStill()) play();
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointerTarget.x = event.clientX / window.innerWidth - 0.5;
    pointerTarget.y = event.clientY / window.innerHeight - 0.5;
    lastPointerMove = performance.now() / 1000;
    wake();
  }

  function onScroll() {
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

  function destroy() {
    isDestroyed = true;
    cancelAnimationFrame(driftFrame);
    driftObserver.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("scroll", onScroll);
    reducedMotion.removeEventListener("change", play);
    stillToggle.removeEventListener("toggle", play);
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
  reducedMotion.addEventListener("change", play);
  stillToggle.addEventListener("toggle", play);

  setDriftPhases();
  resize();
  render(performance.now());
  play();
  requestAnimationFrame(() => layer.classList.add("is-visible"));

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

// WCAG 2.2.2: anything that moves for more than five seconds needs a pause.
function createStillToggle(root: HTMLElement) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cosmos-still-toggle";
  button.title = "Pause space motion";
  button.innerHTML = [
    '<svg class="cosmos-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    '<svg class="cosmos-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>',
    '<span class="cosmos-visually-hidden">Pause space motion</span>',
  ].join("");

  function apply(isPaused: boolean) {
    root.classList.toggle(STILL_CLASS, isPaused);
    button.setAttribute("aria-pressed", String(isPaused));
    button.title = isPaused ? "Resume space motion" : "Pause space motion";
  }

  apply(readStorage(STILL_KEY) === "true");
  button.addEventListener("click", () => {
    const isPaused = !root.classList.contains(STILL_CLASS);
    apply(isPaused);
    writeStorage(STILL_KEY, String(isPaused));
    button.dispatchEvent(new Event("toggle"));
  });
  document.body.append(button);

  return button;
}

function loadStylesheet(href: string) {
  return new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", () => resolve(), { once: true });
    // Without the styles the scene would render unpositioned, but the theme
    // itself still works, so carry on rather than reject.
    link.addEventListener("error", () => resolve(), { once: true });
    document.head.append(link);
  });
}

function ensureFonts() {
  if (document.getElementById(FONTS_ID)) return;
  const fonts = document.createElement("link");
  fonts.id = FONTS_ID;
  fonts.rel = "stylesheet";
  fonts.href = FONTS_URL;
  document.head.append(fonts);
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

interface StartOptions {
  warp?: keyof typeof WARP_MS;
}
