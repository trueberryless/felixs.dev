// The landing page tells its stories one at a time. On wide screens they
// share a stage pinned to the screen and the scroll position picks the one
// on stage; elsewhere each section plays in once as it scrolls into view.
// With reduced motion nothing moves and every section simply shows.
//
// Sections start hidden in CSS, so nothing flashes before this script runs.

const STAGE_QUERY =
  "(min-width: 860px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
// Share of the screen over which the stage eases into and out of its pinned
// place, so it slows down like a page settling instead of stopping dead.
const EASE_SHARE = 0.4;

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
    setActive(rect.top > view ? -1 : Math.floor(progress * frames.length));

    // Easing in: the stage keeps moving with the page when it pins and only
    // slows to a stop over a little more scrolling. Easing out mirrors it.
    const ease = view * EASE_SHARE;
    let shift = 0;
    if (passed < 0) shift = ease / 2;
    else if (passed < ease) shift = (ease / 2) * (1 - passed / ease) ** 2;
    else if (passed > travel) shift = -ease / 2;
    else if (passed > travel - ease)
      shift = -(ease / 2) * ((passed - (travel - ease)) / ease) ** 2;
    root.style.setProperty("--stage-shift", `${shift.toFixed(1)}px`);
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
  root.addEventListener("focusin", (event) => {
    if (!staged.matches) return;
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
