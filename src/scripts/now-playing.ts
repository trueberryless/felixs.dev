const POLL_INTERVAL_MS = 20_000;

interface NowPlaying {
  isPlaying: boolean;
  playedAt?: string;
  progressMs?: number;
  track?: {
    album: string;
    artists: string[];
    durationMs: number;
    imageUrl?: string;
    name: string;
    url: string;
  };
  updatedAt: string;
}

class NowPlayingElement extends HTMLElement {
  #data: NowPlaying | undefined;
  #fetchedAtMs = 0;
  #frame = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  connectedCallback() {
    void this.#refresh();
    this.#timer = setInterval(() => {
      if (document.visibilityState === "visible") void this.#refresh();
    }, POLL_INTERVAL_MS);
    this.#frame = requestAnimationFrame(() => this.#tick());
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
    cancelAnimationFrame(this.#frame);
  }

  async #refresh() {
    const endpoint = this.dataset.endpoint;
    if (!endpoint) return;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) return;

      this.#data = (await response.json()) as NowPlaying;
      this.#fetchedAtMs = Date.now();
      this.#render();
    } catch {
      // The widget stays hidden or stale when the scrobbler is unreachable.
    }
  }

  #render() {
    const track = this.#data?.track;
    if (!this.#data || !track) return;

    this.hidden = false;
    this.classList.toggle("is-playing", this.#data.isPlaying);
    this.#set("[data-track]", track.name);
    this.#set("[data-artists]", track.artists.join(", "));
    this.#set(
      "[data-status]",
      this.#data.isPlaying
        ? "Listening now"
        : `Last played ${formatRelativeTime(this.#data.playedAt)}`
    );

    const link = this.querySelector<HTMLAnchorElement>("[data-link]");
    if (link) link.href = track.url;

    const cover = this.querySelector<HTMLImageElement>("[data-cover]");
    if (cover && track.imageUrl) cover.src = track.imageUrl;
    if (cover) cover.alt = `Cover of ${track.album}`;
  }

  // Moves the progress bar between polls instead of jumping every 20 seconds.
  #tick() {
    const data = this.#data;
    const bar = this.querySelector<HTMLElement>("[data-progress]");
    if (data?.track && bar) {
      const elapsedMs = data.isPlaying ? Date.now() - this.#fetchedAtMs : 0;
      const progressMs = data.isPlaying
        ? (data.progressMs ?? 0) + elapsedMs
        : data.track.durationMs;
      const ratio = Math.min(progressMs / data.track.durationMs, 1);
      bar.style.transform = `scaleX(${ratio})`;
    }

    this.#frame = requestAnimationFrame(() => this.#tick());
  }

  #set(selector: string, text: string) {
    const element = this.querySelector(selector);
    if (element) element.textContent = text;
  }
}

function formatRelativeTime(date: string | undefined) {
  if (!date) return "recently";

  const minutes = Math.round((Date.now() - Date.parse(date)) / 60_000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 60 * 24)
    return format.format(-Math.round(minutes / 60), "hour");

  return format.format(-Math.round(minutes / (60 * 24)), "day");
}

if (!customElements.get("now-playing")) {
  customElements.define("now-playing", NowPlayingElement);
}
