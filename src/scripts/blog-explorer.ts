// Search and topic filters for the blog list. With a mouse, the hovered
// post's cover follows the pointer.

const PREVIEW_OFFSET = { x: 28, y: -40 };
// How quickly the preview catches up with the pointer, per frame at 60 fps.
const PREVIEW_FOLLOW = 0.16;

class BlogExplorer extends HTMLElement {
  #topics = new Set<string>();
  #query = "";
  #cleanup = new AbortController();

  connectedCallback() {
    if (this.dataset.ready !== undefined) return;
    this.dataset.ready = "";

    this.querySelector<HTMLInputElement>("[data-search]")?.addEventListener(
      "input",
      (event) => {
        this.#query = (event.target as HTMLInputElement).value
          .trim()
          .toLowerCase();
        this.#apply();
      }
    );
    this.querySelector<HTMLButtonElement>("[data-more]")?.addEventListener(
      "click",
      (event) => {
        const more = event.currentTarget as HTMLButtonElement;
        const isOpen = more.getAttribute("aria-expanded") !== "true";
        more.setAttribute("aria-expanded", String(isOpen));
        for (const topic of this.querySelectorAll<HTMLElement>(
          "[data-extra]"
        )) {
          topic.hidden =
            !isOpen && !this.#topics.has(topic.dataset.topic ?? "");
        }
        more.textContent = isOpen
          ? "Fewer topics"
          : `${this.querySelectorAll("[data-extra]").length} more topics`;
      }
    );
    this.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-topic]"
      );
      const topic = button?.dataset.topic;
      if (!button || !topic) return;
      if (this.#topics.has(topic)) this.#topics.delete(topic);
      else this.#topics.add(topic);
      button.setAttribute("aria-pressed", String(this.#topics.has(topic)));
      this.#apply();
    });
    this.#followPointer();
  }

  disconnectedCallback() {
    this.#cleanup.abort();
  }

  #apply() {
    const change = () => {
      let shown = 0;
      for (const post of this.querySelectorAll<HTMLElement>(".post")) {
        const topics = (post.dataset.topics ?? "").split("\u001f");
        const matches =
          (this.#topics.size === 0 ||
            topics.some((topic) => this.#topics.has(topic))) &&
          (!this.#query || (post.dataset.search ?? "").includes(this.#query));
        post.hidden = !matches;
        if (matches) shown++;
      }
      for (const year of this.querySelectorAll<HTMLElement>("[data-year]")) {
        year.hidden = !year.querySelector(".post:not([hidden])");
      }
      const empty = this.querySelector<HTMLElement>("[data-empty]");
      if (empty) empty.hidden = shown > 0;
      const status = this.querySelector("[data-status]");
      if (status) {
        const total = this.querySelectorAll(".post").length;
        status.textContent =
          shown === total ? "" : `${shown} of ${total} posts.`;
      }
    };

    // A view transition would freeze the header's blur, so posts just fade back
    // in.
    const hiddenBefore = this.querySelectorAll<HTMLElement>(".post[hidden]");
    change();
    for (const post of hiddenBefore) {
      if (post.hidden) continue;
      post.classList.remove("is-returning");
      void post.offsetWidth;
      post.classList.add("is-returning");
    }
  }

  #followPointer() {
    const preview = this.querySelector<HTMLElement>("[data-preview]");
    const image = preview?.querySelector("img");
    const fine = window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
    );
    if (!preview || !image) return;

    const { signal } = this.#cleanup;
    let target = { x: 0, y: 0 };
    let position = { x: 0, y: 0 };
    let tilt = 0;
    let frame = 0;
    let active: HTMLElement | undefined;
    let request = 0;

    const step = () => {
      const dx = target.x - position.x;
      position = {
        x: position.x + dx * PREVIEW_FOLLOW,
        y: position.y + (target.y - position.y) * PREVIEW_FOLLOW,
      };
      tilt += (Math.max(-8, Math.min(8, dx * 0.08)) - tilt) * PREVIEW_FOLLOW;
      preview.style.translate = `${position.x.toFixed(1)}px ${position.y.toFixed(1)}px`;
      preview.style.rotate = `${tilt.toFixed(2)}deg`;
      const settled =
        Math.abs(dx) < 0.3 &&
        Math.abs(target.y - position.y) < 0.3 &&
        Math.abs(tilt) < 0.05;
      frame = settled ? 0 : requestAnimationFrame(step);
    };

    const hide = () => {
      active = undefined;
      preview.classList.remove("is-visible");
    };

    // The previous cover blurs away at once, and a glow stands in until the
    // next one loads.
    const show = async (cover: string) => {
      const current = ++request;
      image.classList.add("is-loading");
      const next = new Image();
      next.src = cover;
      await next.decode().catch(() => undefined);
      if (current !== request) return;
      image.src = cover;
      image.classList.remove("is-loading");
    };

    this.addEventListener(
      "pointermove",
      (event) => {
        if (!fine.matches || event.pointerType !== "mouse") return;
        const link = (event.target as Element).closest<HTMLElement>(
          ".post-link"
        );
        const cover = link?.dataset.cover;
        if (!link || !cover) {
          hide();
          return;
        }
        target = {
          x: event.clientX + PREVIEW_OFFSET.x,
          y: event.clientY + PREVIEW_OFFSET.y,
        };
        if (link !== active) {
          if (!active) position = { ...target };
          active = link;
          void show(cover);
          preview.classList.add("is-visible");
        }
        frame ||= requestAnimationFrame(step);
      },
      { signal }
    );
    this.addEventListener("pointerleave", hide, { signal });
    // Scrolling moves the page under a resting pointer, so the preview waits
    // for the pointer to move.
    window.addEventListener("scroll", hide, { passive: true, signal });

    // Covers are small, so preload them when idle.
    if (fine.matches) {
      const preload = () => {
        for (const link of this.querySelectorAll<HTMLElement>("[data-cover]")) {
          new Image().src = link.dataset.cover ?? "";
        }
      };
      if ("requestIdleCallback" in window) requestIdleCallback(preload);
      else setTimeout(preload, 1500);
    }
  }
}

if (!customElements.get("blog-explorer")) {
  customElements.define("blog-explorer", BlogExplorer);
}
