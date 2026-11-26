// Sideways scrollers marked `data-edge-scroll` fade their edges where there is
// more to scroll, and show page buttons there for mice. Focus and the picked
// item always scroll fully into view. `data-edge-scroll="end"` starts at the
// recent end and stays there on resize until the visitor scrolls.
import "@/styles/edge-scroll.css";

const SELECTOR = "[data-edge-scroll]:not([data-edge-ready])";
// How long after a wheel, touch or key a scroll counts as the visitor's own.
const OWN_SCROLL_MS = 1000;
const PICKED = ":checked, [aria-current]:not([aria-current='false'])";

/**
 * Marks edges with more to scroll as `data-scroll="start end"` for the fades.
 */
export function markScrollEdges(scroller: HTMLElement) {
  const hasMoreBefore = scroller.scrollLeft > 4;
  const hasMoreAfter =
    scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
  const state = [hasMoreBefore && "start", hasMoreAfter && "end"]
    .filter(Boolean)
    .join(" ");
  if (state) scroller.dataset.scroll = state;
  else delete scroller.dataset.scroll;
  return { hasMoreAfter, hasMoreBefore };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The part of an item that has to show, like the label of a radio. */
function visiblePart(element: Element) {
  return element.closest("label") ?? element;
}

/** Scrolls an item fully into view, clear of the fades (the scroll padding). */
function reveal(scroller: HTMLElement, item: Element, smooth: boolean) {
  const style = getComputedStyle(scroller);
  const paddingStart = Number.parseFloat(style.scrollPaddingInlineStart) || 0;
  const paddingEnd = Number.parseFloat(style.scrollPaddingInlineEnd) || 0;
  const box = scroller.getBoundingClientRect();
  const rect = visiblePart(item).getBoundingClientRect();
  let shift = 0;
  if (rect.left < box.left + paddingStart) {
    shift = rect.left - box.left - paddingStart;
  } else if (rect.right > box.right - paddingEnd) {
    shift = rect.right - box.right + paddingEnd;
  }
  if (Math.abs(shift) < 1) return;
  scroller.scrollBy({
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "instant",
    left: shift,
  });
}

function chevron(direction: "start" | "end") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    direction === "start" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"
  );
  svg.append(path);
  return svg;
}

function enhance(scroller: HTMLElement) {
  scroller.dataset.edgeReady = "";

  // A frame around the scroller holds the buttons. Pages may render it
  // themselves to style it before this runs.
  let frame = scroller.parentElement;
  if (!frame?.classList.contains("edge-scroll-frame")) {
    frame = document.createElement("div");
    frame.className = "edge-scroll-frame";
    scroller.before(frame);
    frame.append(scroller);
  }

  const pinsToEnd = scroller.dataset.edgeScroll === "end";
  let isPinned = pinsToEnd;
  let lastInput = -Infinity;

  // The buttons only help mice, so they skip the tab order and screen readers.
  const buttons = (["start", "end"] as const).map((direction) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edge-scroll-button";
    button.dataset.edge = direction;
    button.tabIndex = -1;
    button.setAttribute("aria-hidden", "true");
    button.append(chevron(direction));
    button.addEventListener("click", () => {
      lastInput = performance.now();
      const style = getComputedStyle(scroller);
      const fade = Number.parseFloat(style.scrollPaddingInlineEnd) || 0;
      const page = Math.max(
        scroller.clientWidth - fade * 2,
        scroller.clientWidth / 2
      );
      scroller.scrollBy({
        behavior: prefersReducedMotion() ? "instant" : "smooth",
        left: direction === "start" ? -page : page,
      });
    });
    frame.append(button);
    return button;
  });

  const mark = () => {
    const { hasMoreAfter, hasMoreBefore } = markScrollEdges(scroller);
    buttons[0].hidden = !hasMoreBefore;
    buttons[1].hidden = !hasMoreAfter;
  };
  scroller.addEventListener(
    "scroll",
    () => {
      // Only the visitor's scrolling lets go of the end, not the browser
      // clamping it during a resize.
      if (performance.now() - lastInput < OWN_SCROLL_MS) {
        isPinned =
          pinsToEnd &&
          scroller.scrollLeft + scroller.clientWidth >=
            scroller.scrollWidth - 2;
      }
      mark();
    },
    { passive: true }
  );
  for (const type of ["wheel", "pointerdown", "touchstart", "keydown"]) {
    scroller.addEventListener(type, () => (lastInput = performance.now()), {
      passive: true,
    });
  }
  // The content can grow without the scroller resizing, so watch the children
  // too.
  const resizes = new ResizeObserver(() => {
    if (isPinned) scroller.scrollLeft = scroller.scrollWidth;
    mark();
  });
  for (const element of [scroller, ...scroller.children]) {
    resizes.observe(element);
  }
  // A group animating open may fit only after the last resize.
  scroller.addEventListener("transitionend", mark);

  scroller.addEventListener("focusin", (event) => {
    const target = event.target as Element;
    if (target !== scroller) reveal(scroller, target, true);
  });
  scroller.addEventListener("change", (event) => {
    reveal(scroller, event.target as Element, true);
  });

  const picked = scroller.querySelector(PICKED);
  if (isPinned) scroller.scrollLeft = scroller.scrollWidth;
  else if (picked) reveal(scroller, picked, false);
  mark();
}

function enhanceAll() {
  for (const scroller of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    enhance(scroller);
  }
}

enhanceAll();
document.addEventListener("astro:page-load", enhanceAll);
// Most scrollers arrive later in islands or scripts, and the router swaps the
// body, so observe the root.
new MutationObserver(enhanceAll).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
