const SVG_NS = "http://www.w3.org/2000/svg";

const numberFormat = new Intl.NumberFormat("en-US");

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number | undefined> = {},
  children: (Node | string | undefined | false)[] = []
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setAttributes(element, attributes);
  for (const child of children) if (child) element.append(child);
  return element;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number | undefined> = {},
  children: (Node | undefined | false)[] = []
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  setAttributes(element, attributes);
  for (const child of children) if (child) element.append(child);
  return element;
}

export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

/**
 * Fades a freshly rendered element in, `order` steps after the first one,
 * so a whole page of changes arrives as one wave.
 */
export function reveal(element: Element | null, order = 0) {
  if (!(element instanceof HTMLElement) || prefersReducedMotion()) return;
  element.classList.remove("ms-reveal");
  // Reading the layout restarts the animation.
  void element.offsetWidth;
  element.style.setProperty("--reveal", String(order));
  element.classList.add("ms-reveal");
}

/** An element's position inside one of its ancestors, ignoring transforms. */
export function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = element;
  while (current && current !== ancestor) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return {
    bottom: top + element.offsetHeight,
    left,
    right: left + element.offsetWidth,
    top,
  };
}

export function formatDate(
  date: string,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString(
    "en-US",
    {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
      ...options,
    }
  );
}

export function formatRelative(ms: number, nowMs = Date.now()): string {
  const minutes = Math.round((nowMs - ms) / 60_000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 60 * 24)
    return format.format(-Math.round(minutes / 60), "hour");
  return format.format(-Math.round(minutes / (60 * 24)), "day");
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts an element's number up (or down) to its new value.
 */
export function animateNumber(element: Element, to: number, durationMs = 900) {
  const from = Number(element.getAttribute("data-value") ?? 0);
  element.setAttribute("data-value", String(to));
  if (prefersReducedMotion() || from === to) {
    element.textContent = formatNumber(to);
    return;
  }

  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startedAt) / durationMs, 1);
    const eased = 1 - (1 - progress) ** 4;
    element.textContent = formatNumber(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function setAttributes(
  element: Element,
  attributes: Record<string, string | number | undefined>
) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    if (key === "text") element.textContent = String(value);
    else element.setAttribute(key, String(value));
  }
}
