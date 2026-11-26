// Blog post enhancements: copy buttons on code, big GIFs on request and a
// lightbox for images.

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
  // The cover loads first and should show the moment it does.
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
 * Inspired by starlight-image-zoom: the image grows from its spot to fill the
 * screen, with its alt text below. A click, Escape or scrolling closes it.
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
    // Phones show the smaller copy, the zoom swaps in the full one once loaded.
    if (image.currentSrc && image.currentSrc !== image.src) {
      const full = new Image();
      full.src = image.src;
      void full
        .decode()
        .then(() => {
          if (source === image) zoomed.src = image.src;
        })
        .catch(() => undefined);
    }
    zoomed.alt = image.alt;
    zoomed.width = image.naturalWidth || image.width;
    zoomed.height = image.naturalHeight || image.height;
    caption.textContent = image.alt;
    caption.hidden = !image.alt;

    dialog.showModal();
    // An undecoded copy has no size yet, so take it from the image in the post.
    const from = image.getBoundingClientRect();
    fitZoomed(from.width / from.height);
    if (reducedMotion()) return;
    const to = zoomed.getBoundingClientRect();
    image.style.visibility = "hidden";
    zoomed.animate(flip(from, to), { duration: ZOOM_MS, easing: ZOOM_EASING });
  };

  const fitZoomed = (ratio: number) => {
    const padding = Number.parseFloat(getComputedStyle(dialog).paddingLeft);
    const maxWidth = Math.min(dialog.clientWidth - padding * 2, 1400);
    const maxHeight = window.innerHeight - 140;
    const width = Math.min(maxWidth, maxHeight * ratio);
    zoomed.style.width = `${width}px`;
    zoomed.style.height = `${width / ratio}px`;
  };

  // The image flies back to its current spot, so closing by scrolling follows
  // the page.
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

  // The article is replaced on every page, so listeners never pile up.
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
  // Scrolling closes it quickly and lets the page move on.
  const scrollAway = () => void close(ZOOM_MS * 0.5);
  dialog.addEventListener("wheel", scrollAway, { passive: true });
  dialog.addEventListener("touchmove", scrollAway, { passive: true });
}
