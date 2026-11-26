// Numbers count up as their card rises in. The page renders the final value
// for no-JS, so this resets it to zero while the card is transparent and
// counts once it's mostly in view.

const DURATION_MS = 1200;
// Matches the stagger of the cards rising in `NumberCards.astro`.
const STAGGER_MS = 70;
// How long a card fades in before its number moves.
const LEAD_MS = 220;

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const running = new WeakMap<Element, number>();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts an element's number from its current value to a new one. A count
 * already heading there carries on. First counts are left to `countAll`,
 * which knows when the card rises in.
 */
export function countTo(element: Element, to: number, delayMs = 0) {
  const target = element.getAttribute("data-value");
  const isFirst =
    target === null && Number(element.getAttribute("data-count-to")) === to;
  if (isFirst || (target !== null && Number(target) === to)) return;
  const from = Number(element.getAttribute("data-shown") ?? target ?? 0);
  element.setAttribute("data-value", String(to));
  cancelAnimationFrame(running.get(element) ?? 0);

  const show = (value: number) => {
    element.setAttribute("data-shown", String(value));
    element.textContent = numberFormat.format(value);
  };
  if (prefersReducedMotion() || from === to) {
    show(to);
    return;
  }

  const startedAt = performance.now() + delayMs;
  const step = (now: number) => {
    const progress = Math.min(Math.max((now - startedAt) / DURATION_MS, 0), 1);
    const eased = 1 - (1 - progress) ** 3;
    show(from + (to - from) * eased);
    if (progress < 1) running.set(element, requestAnimationFrame(step));
  };
  running.set(element, requestAnimationFrame(step));
}

function countAll() {
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-count-to]:not([data-value])"
  )) {
    const order = Number(element.dataset.countOrder ?? 0);
    element.setAttribute("data-value", "0");
    element.setAttribute("data-shown", "0");
    countTo(
      element,
      Number(element.dataset.countTo),
      LEAD_MS + order * STAGGER_MS
    );
  }
}

countAll();
document.addEventListener("astro:page-load", countAll);
// Most numbers arrive later in server islands, and the router swaps the
// body, so observe the root.
new MutationObserver(countAll).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
