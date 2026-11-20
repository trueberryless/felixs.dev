// Numbers count up to their value as their card rises in, the same way on
// every page. The page renders the final number, so it reads right without
// scripts; here it starts from zero instead, while the card is still
// transparent.

const DURATION_MS = 900;
// Matches the stagger of the cards rising in `NumberCards.astro`.
const STAGGER_MS = 70;

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});
const running = new WeakMap<Element, number>();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts an element's number from the value it shows now to a new one. A
 * count already running towards the same value carries on.
 */
export function countTo(element: Element, to: number, delayMs = 0) {
  const target = element.getAttribute("data-value");
  if (target !== null && Number(target) === to) return;
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
    const eased = 1 - (1 - progress) ** 4;
    show(from + (to - from) * eased);
    if (progress < 1) running.set(element, requestAnimationFrame(step));
  };
  running.set(element, requestAnimationFrame(step));
}

function countAll() {
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-count-to]:not([data-value])"
  )) {
    const to = Number(element.dataset.countTo);
    const order = Number(element.dataset.countOrder ?? 0);
    element.setAttribute("data-shown", "0");
    countTo(element, to, order * STAGGER_MS);
  }
}

countAll();
document.addEventListener("astro:page-load", countAll);
// Most numbers arrive after the page, in server islands.
new MutationObserver(countAll).observe(document.body, {
  childList: true,
  subtree: true,
});
