// Buttons and small links lean towards the pointer as it comes near, like a
// gentle pull of gravity: the closer the pointer, the stronger the pull. It
// helps to hit them and replaces the little jump they used to make on hover.
//
// Only standalone controls take part, never links inside running text, cards
// or big charts: every `.button`, the footer links and icons and the dots of
// the writing timeline. It only runs with a fine pointer that can hover, and
// never with reduced motion.

const SELECTOR = [
  ".button",
  ".posts-link",
  ".text-links a",
  ".icon-links a",
  "[data-magnetic]",
].join(", ");

// How far around an element the pull reaches, in pixels.
const REACH = 70;
// The share of the distance to the pointer an element may travel.
const PULL = 0.28;
// How far an element moves at most: a few pixels, less for small ones.
const MAX_SHIFT = 7;
// How quickly an element follows its target, per frame at 60 fps.
const FOLLOW = 0.16;

interface Magnet {
  element: HTMLElement | SVGElement;
  /** The space theme floats some elements with `transform`. */
  property: "transform" | "translate";
  x: number;
  y: number;
}

const supported = window.matchMedia(
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
);
let magnets: Magnet[] = [];
let pointer: { x: number; y: number } | undefined;
let frame = 0;
let last = 0;

function collect() {
  for (const magnet of magnets) reset(magnet);
  magnets = supported.matches
    ? [...document.querySelectorAll<HTMLElement | SVGElement>(SELECTOR)].map(
        (element) => ({
          element,
          // Elements that float in space already move with `transform`, so
          // they lean with `translate`. Everything else leans with
          // `transform`, since `translate` drives their entrance.
          property:
            getComputedStyle(element).animationName === "none"
              ? "transform"
              : "translate",
          x: 0,
          y: 0,
        })
      )
    : [];
}

function reset(magnet: Magnet) {
  magnet.element.style.removeProperty(magnet.property);
  magnet.x = 0;
  magnet.y = 0;
}

function step(now: number) {
  const dt = last ? Math.min(3, (now - last) / 16.7) : 1;
  last = now;
  const follow = 1 - (1 - FOLLOW) ** dt;
  let moving = false;

  for (const magnet of magnets) {
    const box = magnet.element.getBoundingClientRect();
    if (
      box.width === 0 ||
      box.bottom < -REACH ||
      box.top > innerHeight + REACH
    ) {
      if (magnet.x || magnet.y) reset(magnet);
      continue;
    }

    // Where the element would be without the pull, wherever it floats.
    const left = box.left - magnet.x;
    const top = box.top - magnet.y;
    let targetX = 0;
    let targetY = 0;
    if (pointer) {
      const gapX = Math.max(
        left - pointer.x,
        0,
        pointer.x - (left + box.width)
      );
      const gapY = Math.max(top - pointer.y, 0, pointer.y - (top + box.height));
      const distance = Math.hypot(gapX, gapY);
      if (distance < REACH) {
        // Nearer is stronger, and the pull fades out smoothly at its edge.
        const strength = (1 - distance / REACH) ** 2;
        const limit = Math.min(
          MAX_SHIFT,
          Math.max(2, Math.min(box.width, box.height) * 0.3)
        );
        const dx = pointer.x - (left + box.width / 2);
        const dy = pointer.y - (top + box.height / 2);
        const length = Math.hypot(dx, dy) || 1;
        const shift = Math.min(length * PULL * strength, limit);
        targetX = (dx / length) * shift;
        targetY = (dy / length) * shift;
      }
    }

    magnet.x += (targetX - magnet.x) * follow;
    magnet.y += (targetY - magnet.y) * follow;
    if (
      Math.abs(targetX - magnet.x) > 0.05 ||
      Math.abs(targetY - magnet.y) > 0.05
    )
      moving = true;

    if (Math.abs(magnet.x) < 0.05 && Math.abs(magnet.y) < 0.05) {
      if (magnet.element.style.getPropertyValue(magnet.property)) reset(magnet);
      continue;
    }
    const value = `${magnet.x.toFixed(2)}px ${magnet.y.toFixed(2)}px`;
    magnet.element.style.setProperty(
      magnet.property,
      magnet.property === "translate"
        ? value
        : `translate(${value.replace(" ", ", ")})`
    );
  }

  frame = moving ? requestAnimationFrame(step) : 0;
  if (!frame) last = 0;
}

// A frame asked for in a background tab may never come, so a request that
// is still waiting after a moment is replaced.
let requestedAt = 0;
function wake() {
  if (magnets.length === 0) return;
  if (frame && performance.now() - requestedAt < 250) return;
  cancelAnimationFrame(frame);
  requestedAt = performance.now();
  frame = requestAnimationFrame(step);
}

window.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    pointer = { x: event.clientX, y: event.clientY };
    wake();
  },
  { passive: true }
);
document.documentElement.addEventListener("pointerleave", () => {
  pointer = undefined;
  wake();
});
// Buttons fill with a circle that grows from where the pointer came in and
// shrinks back to where it left.
function fill(event: PointerEvent, isEntering: boolean) {
  if (!supported.matches) return;
  const button = (event.target as Element | null)?.closest<HTMLElement>(
    ".button"
  );
  if (!button || button.contains(event.relatedTarget as Node | null)) return;
  if ((button as HTMLButtonElement).disabled) return;
  const box = button.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;
  // Big enough to cover the whole button from this point.
  const size =
    2 * Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  button.style.setProperty("--fill-x", `${x}px`);
  button.style.setProperty("--fill-y", `${y}px`);
  button.style.setProperty("--fill-size", `${Math.ceil(size)}px`);
  button.classList.toggle("is-filled", isEntering);
}
document.addEventListener("pointerover", (event) => fill(event, true));
document.addEventListener("pointerout", (event) => fill(event, false));

// Content moves under a resting pointer while scrolling.
window.addEventListener("scroll", wake, { passive: true });
supported.addEventListener("change", collect);
document.addEventListener("astro:page-load", collect);
// Server islands and the music page add their controls later.
let pending = 0;
new MutationObserver(() => {
  clearTimeout(pending);
  pending = window.setTimeout(collect, 200);
}).observe(document.documentElement, { childList: true, subtree: true });
// Switching themes starts or stops the floating in space.
new MutationObserver(collect).observe(document.documentElement, {
  attributeFilter: ["class"],
});
collect();
