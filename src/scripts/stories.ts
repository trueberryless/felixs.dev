// The landing page tells its stories one at a time. On wide screens they
// share a stage pinned to the screen and the scroll position picks the one
// on stage; elsewhere each section plays in once as it scrolls into view.
// With reduced motion nothing moves and every section simply shows.
//
// Sections start hidden in CSS, so nothing flashes before this script runs.

const STAGE_QUERY =
  "(min-width: 860px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
// Browsers with scroll timelines move the stage in CSS, off the main thread.
const HAS_SCROLL_TIMELINE = CSS.supports("animation-timeline: view()");
// Before and after the stage, a section's middle sits this share of the screen
// from the edge of the stories, so the first one follows right after the intro.
const FLOW_GAP = 0.32;
// How far, as a share of the screen, a section glides while it slows down into
// the middle of the screen, and while it speeds up again to leave.
const GLIDE = 0.25;

function setup() {
  const root = document.querySelector<HTMLElement>("[data-stories]");
  const stage = root?.querySelector<HTMLElement>(".stories-stage");
  if (!root || !stage || root.dataset.ready !== undefined) return;
  root.dataset.ready = "";

  // Listeners on the window end with the page, as the client router swaps
  // pages without reloading.
  const cleanup = new AbortController();
  document.addEventListener("astro:before-swap", () => cleanup.abort(), {
    once: true,
  });
  const { signal } = cleanup;
  const staged = window.matchMedia(STAGE_QUERY);
  const reduced = window.matchMedia(REDUCED_QUERY);
  let frames: HTMLElement[] = [];
  let active = -2;
  let pending = 0;

  const setActive = (index: number) => {
    if (index === active) return;
    active = index;
    frames.forEach((frame, position) => {
      frame.dataset.active = String(position === index);
      frame.dataset.side = position < index ? "before" : "after";
    });
  };

  // The scroll position that puts a section on stage.
  const scrollTopOf = (index: number) => {
    const travel = root.offsetHeight - window.innerHeight;
    const top = root.getBoundingClientRect().top + window.scrollY;
    return top + ((index + 0.5) / frames.length) * travel;
  };

  // Snap points in the middle of every section's stretch of scrolling, so a
  // quick flick stops at the next section instead of rushing past it.
  const placeSnaps = () => {
    for (const snap of root.querySelectorAll(".stories-snap")) snap.remove();
    if (!staged.matches) return;
    frames.forEach((_, index) => {
      const snap = document.createElement("span");
      snap.className = "stories-snap";
      snap.setAttribute("aria-hidden", "true");
      snap.style.setProperty("--i", String(index));
      root.append(snap);
    });
  };

  const update = () => {
    pending = 0;
    if (reduced.matches) {
      for (const frame of frames) frame.dataset.active = "true";
      active = -2;
      return;
    }

    const rect = root.getBoundingClientRect();
    const view = window.innerHeight;
    if (!staged.matches) {
      // Without a stage, sections play in once as they scroll into view.
      root.style.removeProperty("--stage-shift");
      for (const frame of frames) {
        if (frame.getBoundingClientRect().top < view * 0.85)
          frame.dataset.active = "true";
      }
      return;
    }

    const travel = Math.max(1, rect.height - view);
    const passed = -rect.top;
    const progress = Math.min(Math.max(passed / travel, 0), 0.9999);
    // The first section is already on stage as it scrolls into view.
    setActive(rect.top >= view ? -1 : Math.floor(progress * frames.length));

    if (!HAS_SCROLL_TIMELINE) {
      root.style.setProperty(
        "--stage-shift",
        `${getStageShift(passed, travel, view).toFixed(1)}px`
      );
    }
  };
  const schedule = () => {
    pending ||= requestAnimationFrame(update);
  };

  const collect = () => {
    frames = [...stage.querySelectorAll<HTMLElement>(":scope > .story-frame")];
    root.style.setProperty("--count", String(frames.length));
    active = -2;
    placeSnaps();
    update();
  };

  // Keyboard users tab through every section: focusing a link in a section
  // that isn't on stage scrolls it onto the stage.
  // Only a Tab press counts: coming back to the browser tab refocuses the last
  // focused link, which must not scroll anywhere.
  let tabbedAt = 0;
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") tabbedAt = performance.now();
    },
    { signal }
  );
  root.addEventListener("focusin", (event) => {
    if (!staged.matches || performance.now() - tabbedAt > 500) return;
    const frame = (event.target as Element).closest<HTMLElement>(
      ".story-frame"
    );
    const index = frame ? frames.indexOf(frame) : -1;
    if (index === -1 || index === active) return;
    window.scrollTo({ behavior: "instant", top: scrollTopOf(index) });
    update();
  });

  // Server islands replace their placeholders after the page has loaded.
  new MutationObserver(collect).observe(stage, { childList: true });
  window.addEventListener("scroll", schedule, { passive: true, signal });
  window.addEventListener("resize", schedule, { signal });
  staged.addEventListener("change", collect, { signal });
  reduced.addEventListener("change", collect, { signal });
  collect();
}

setup();
document.addEventListener("astro:page-load", setup);

/**
 * How far the stage moves away from its pinned place, so a section never stops
 * dead. It follows the page right after the intro, glides into the middle of
 * the screen and slows down until it rests there, and at the end it speeds up
 * the same way until it moves with the page again and the footer follows.
 */
function getStageShift(passed: number, travel: number, view: number) {
  const middle = view / 2;
  const glide = view * GLIDE;
  const length = glide * 2;
  const enterEnd = view * FLOW_GAP - middle - glide + length;
  const leaveEnd = travel + middle - view * FLOW_GAP + glide;
  const stageTop = passed < 0 ? -passed : passed > travel ? travel - passed : 0;

  let centre = middle;
  if (passed < enterEnd - length) {
    centre = view * FLOW_GAP - passed;
  } else if (passed < enterEnd) {
    const u = (passed - (enterEnd - length)) / length;
    centre = middle + glide - glide * (1 - (1 - u) ** 2);
  } else if (passed > leaveEnd) {
    centre = middle - glide - (passed - leaveEnd);
  } else if (passed > leaveEnd - length) {
    const w = (passed - (leaveEnd - length)) / length;
    centre = middle - glide * w ** 2;
  }

  return centre - (stageTop + middle);
}
