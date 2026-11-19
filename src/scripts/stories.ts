// The landing page tells its stories one at a time. On wide screens they
// share a stage pinned to the screen and the scroll position picks the one
// on stage; elsewhere each section plays in once as it scrolls into view.
// With reduced motion nothing moves and every section simply shows.

const STAGE_QUERY =
  "(min-width: 860px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

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

  const update = () => {
    pending = 0;
    if (reduced.matches) {
      delete root.dataset.stage;
      for (const frame of frames) delete frame.dataset.active;
      active = -2;
      return;
    }
    if (!staged.matches) {
      // Without a stage, sections play in once as they scroll into view.
      delete root.dataset.stage;
      for (const frame of frames) {
        if (
          frame.dataset.active === "false" &&
          frame.getBoundingClientRect().top < window.innerHeight * 0.85
        ) {
          frame.dataset.active = "true";
        }
      }
      return;
    }

    root.dataset.stage = "";
    const rect = root.getBoundingClientRect();
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = Math.min(Math.max(-rect.top / travel, 0), 0.9999);
    // The first section plays in as the stage arrives.
    setActive(
      rect.top > window.innerHeight * 0.55
        ? -1
        : Math.floor(progress * frames.length)
    );
  };
  const schedule = () => {
    pending ||= requestAnimationFrame(update);
  };

  const collect = () => {
    frames = [...stage.querySelectorAll<HTMLElement>(":scope > .story-frame")];
    root.style.setProperty("--count", String(frames.length));
    active = -2;
    if (!staged.matches && !reduced.matches) {
      for (const frame of frames) {
        if (frame.dataset.active !== "true") frame.dataset.active = "false";
      }
    }
    update();
  };

  // Keyboard users tab through every section: focusing a link in a section
  // that isn't on stage scrolls it onto the stage.
  root.addEventListener("focusin", (event) => {
    if (root.dataset.stage === undefined) return;
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
