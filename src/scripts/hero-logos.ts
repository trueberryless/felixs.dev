import { type Obstacle, type Rect, spreadOut } from "@/lib/spread";

// Spreads the hero logos evenly around the name, like repelling particles, in
// the room this screen and theme leave. The name pushes harder than the header
// and edges, so the space near those gets used too.
//
// The hero inlines this script right after its markup, so the logos are placed
// before the first paint and never move after they show up.
const NAME_SHARE = 0.55;
const HEADER_SHARE = 0.3;
// The music dock and the pause button sit at the bottom of the screen.
const BOTTOM_ROOM = 48;
// Matches the glide in the hero's styles.
const GLIDE_MS = 800;

declare global {
  interface Window {
    heroLogos?: { placeAll: (glide?: boolean) => void };
  }
}

function placeAll(glide = false) {
  for (const logos of document.querySelectorAll<HTMLElement>(
    ".floating-logos"
  )) {
    loadShown(logos);
    place(logos, glide);
  }
}

// The logos are lazy, so the copies for the other theme and the ones a phone
// leaves out never load. The shown ones are loaded right away instead of
// waiting for layout.
function loadShown(logos: HTMLElement) {
  for (const image of logos.querySelectorAll<HTMLImageElement>(
    "img[loading='lazy']"
  )) {
    if (image.offsetWidth > 0) image.loading = "eager";
  }
}

function place(logos: HTMLElement, glide: boolean) {
  const hero = logos.closest<HTMLElement>(".hero-viewport");
  const name = hero?.querySelector(".hero-text");
  if (!hero || !name) return;

  const items = [
    ...logos.querySelectorAll<HTMLElement>(".logo-parallax"),
  ].filter((item) => item.offsetParent !== null);
  const frame = logos.getBoundingClientRect();
  // Logo coordinates at scroll top: the header is fixed, the name has
  // parallax.
  const local = (rect: DOMRect, shiftY = 0): Rect => ({
    bottom: rect.bottom - frame.top - shiftY,
    left: rect.left - frame.left,
    right: rect.right - frame.left,
    top: rect.top - frame.top - shiftY,
  });

  const heroBox = local(hero.getBoundingClientRect());
  const box = { ...heroBox, bottom: heroBox.bottom - BOTTOM_ROOM };
  const text = document.createRange();
  text.selectNodeContents(name);
  const wrapper = name.closest(".parallax");
  const lift = wrapper
    ? new DOMMatrix(getComputedStyle(wrapper).transform).m42
    : 0;
  const obstacles: Obstacle[] = [
    { rect: local(text.getBoundingClientRect(), lift), share: NAME_SHARE },
  ];
  const header = document.querySelector(".header-inner");
  if (header) {
    obstacles.push({
      rect: local(header.getBoundingClientRect(), window.scrollY),
      share: HEADER_SHARE,
    });
  }

  // Every layout starts from the markup spots, so a resize matches a reload.
  // Only a glide needs the logos back where they were before they move.
  const placed = items.map(({ style }) => [style.left, style.top] as const);
  logos.classList.remove("is-gliding");
  for (const { style } of items) {
    style.left = "";
    style.top = "";
  }
  const seeds = items.map((item) => ({
    reach: reachOf(item),
    x: item.offsetLeft,
    y: item.offsetTop,
  }));
  const points = spreadOut(seeds, box, obstacles);

  if (glide) {
    for (const [index, { style }] of items.entries()) {
      [style.left, style.top] = placed[index]!;
    }
    void logos.offsetWidth;
    logos.classList.add("is-gliding");
    setTimeout(() => logos.classList.remove("is-gliding"), GLIDE_MS);
  }
  for (const [index, item] of items.entries()) {
    item.style.left = `${points[index]!.x.toFixed(1)}px`;
    item.style.top = `${points[index]!.y.toFixed(1)}px`;
  }
}

// Half a logo plus some air. Saturn's rings reach further.
function reachOf(item: HTMLElement) {
  const logo = item.querySelector<HTMLElement>(".logo-wrapper");
  if (!logo) return 0;
  const hasRings =
    document.documentElement.classList.contains("space") &&
    logo.dataset.planet === "saturn";
  return (logo.offsetWidth / 2) * (hasRings ? 1.8 : 1) + 12;
}

function watch() {
  let pending = 0;
  const later = (glide: boolean) => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => placeAll(glide));
  };

  // Runs after layout and before paint, so the logos follow every resize,
  // including a scrollbar that shows up once the rest of the page loads.
  const resizes = new ResizeObserver(() => placeAll());
  const observe = () => {
    resizes.disconnect();
    for (const hero of document.querySelectorAll(".hero-viewport")) {
      resizes.observe(hero);
    }
  };
  observe();
  document.addEventListener("astro:page-load", observe);
  // The space theme sets the name in a web font, which may load later.
  void document.fonts.ready.then(() => placeAll());
  // A new theme changes the name's font, so the logos glide to new spots.
  let theme = document.documentElement.className;
  new MutationObserver(() => {
    const next = document.documentElement.className;
    if (next === theme) return;
    theme = next;
    later(true);
  }).observe(document.documentElement, { attributeFilter: ["class"] });

  return { placeAll };
}

// The router runs inline scripts again after every visit to the page.
window.heroLogos ??= watch();
window.heroLogos.placeAll();
