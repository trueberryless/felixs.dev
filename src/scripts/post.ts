// Small enhancements for blog posts: copy buttons on code, big GIFs that only
// load on request, and images that zoom into a lightbox.

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ZOOM_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const ZOOM_MS = 420;

export function setUpPost() {
  setUpCopyButtons();
  setUpGifs();
  setUpImageSkeletons();
  setUpLightbox();
}

function setUpImageSkeletons() {
  // The cover is the first thing to load and should show the moment it does.
  for (const image of document.querySelectorAll<HTMLImageElement>(
    ".post-image:not(.post-cover) .post-zoom img"
  )) {
    if (image.complete) continue;
    const button = image.parentElement;
    button?.toggleAttribute("data-loading", true);
    const done = () => button?.removeAttribute("data-loading");
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function announce(message: string) {
  let status = document.querySelector<HTMLElement>("[data-post-status]");
  if (!status) {
    status = document.createElement("p");
    status.className = "sr-only";
    status.setAttribute("aria-live", "polite");
    status.dataset.postStatus = "";
    document.body.append(status);
  }
  status.textContent = "";
  requestAnimationFrame(() => (status.textContent = message));
}

function setUpCopyButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".post-copy[data-copy]:not([data-ready])"
  )) {
    button.dataset.ready = "";
    let timer = 0;
    button.addEventListener("click", async () => {
      const code = button
        .closest(".post-code")
        ?.querySelector("pre")?.innerText;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        announce("Copying didn't work, select the code instead.");
        return;
      }
      button.toggleAttribute("data-copied", true);
      announce("Copied to the clipboard.");
      clearTimeout(timer);
      timer = window.setTimeout(
        () => button.removeAttribute("data-copied"),
        1800
      );
    });
  }
}

function setUpGifs() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".post-gif:not([data-ready])"
  )) {
    button.dataset.ready = "";
    button.addEventListener("click", () => {
      const image = document.createElement("img");
      image.src = button.dataset.gif ?? "";
      image.alt = button.dataset.alt ?? "";
      image.decoding = "async";
      image.className = "post-gif-image";
      button.toggleAttribute("data-loading", true);
      button.setAttribute("aria-busy", "true");
      image.addEventListener(
        "load",
        () => {
          button.replaceWith(image);
          announce("The animation is playing.");
        },
        { once: true }
      );
    });
  }
}

/**
 * Inspired by starlight-image-zoom: the image grows from where it sits in the
 * post to fill the screen, with its alt text underneath. A click, Escape or
 * scrolling puts it back.
 */
function setUpLightbox() {
  const dialog = document.querySelector<HTMLDialogElement>(".post-lightbox");
  const zoomed = dialog?.querySelector<HTMLImageElement>(
    ".post-lightbox-image"
  );
  const caption = dialog?.querySelector<HTMLElement>(".post-lightbox-caption");
  if (!dialog || !zoomed || !caption || dialog.dataset.ready !== undefined)
    return;
  dialog.dataset.ready = "";

  let source: HTMLImageElement | undefined;
  let isClosing = false;

  const flip = (from: DOMRect, to: DOMRect) => [
    {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
    },
    { transform: "none" },
  ];

  const open = (image: HTMLImageElement) => {
    source = image;
    zoomed.src = image.currentSrc || image.src;
    zoomed.alt = image.alt;
    zoomed.width = image.naturalWidth || image.width;
    zoomed.height = image.naturalHeight || image.height;
    caption.textContent = image.alt;
    caption.hidden = !image.alt;

    dialog.showModal();
    if (reducedMotion()) return;
    const from = image.getBoundingClientRect();
    const to = zoomed.getBoundingClientRect();
    image.style.visibility = "hidden";
    zoomed.animate(flip(from, to), { duration: ZOOM_MS, easing: ZOOM_EASING });
  };

  // The image flies back to wherever its spot in the post is right now, so
  // when scrolling closes it, it follows the page instead of hanging in the
  // middle of the screen.
  const flyBack = (target: HTMLImageElement, duration: number) =>
    new Promise<void>((resolve) => {
      zoomed.getAnimations().forEach((animation) => animation.finish());
      const from = zoomed.getBoundingClientRect();
      const start = performance.now();
      const step = (now: number) => {
        const progress = easeOut(Math.min(1, (now - start) / duration));
        const to = target.getBoundingClientRect();
        const scaleX = 1 + (to.width / from.width - 1) * progress;
        const scaleY = 1 + (to.height / from.height - 1) * progress;
        zoomed.style.transform = `translate(${(to.left - from.left) * progress}px, ${(to.top - from.top) * progress}px) scale(${scaleX}, ${scaleY})`;
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

  const close = async (duration = ZOOM_MS * 0.8) => {
    if (!dialog.open || isClosing) return;
    isClosing = true;
    dialog.toggleAttribute("data-closing", true);
    if (source && !reducedMotion()) await flyBack(source, duration);
    if (source) source.style.visibility = "";
    dialog.close();
    zoomed.style.transform = "";
    zoomed.getAnimations().forEach((animation) => animation.cancel());
    dialog.removeAttribute("data-closing");
    isClosing = false;
  };

  // The article comes with each page, so this listener never piles up.
  document.querySelector(".post")?.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      ".post-zoom"
    );
    const image = button?.querySelector("img");
    if (image) open(image);
  });
  dialog.addEventListener("click", () => void close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void close();
  });
  // Scrolling closes it quickly and lets the page move on underneath.
  const scrollAway = () => void close(ZOOM_MS * 0.5);
  dialog.addEventListener("wheel", scrollAway, { passive: true });
  dialog.addEventListener("touchmove", scrollAway, { passive: true });
}
