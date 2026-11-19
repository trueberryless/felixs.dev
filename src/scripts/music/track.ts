import { formatRelative, html, svg } from "./dom";

const PLAY_LIMIT = 10;
const REFRESH_MS = 60_000;
const DRIFT_MS = 15_000;
const COVER_CACHE_KEY = "music-covers";
// The newest song sits near the right end, the oldest near the left.
const NEWEST_AT = 0.9;
const OLDEST_AT = 0.07;

interface TrackPlay {
  artist: string;
  at: number;
  key: string;
  title: string;
  url: string | undefined;
}

/**
 * Renders recent plays as covers hanging off a winding track. Positions mix
 * the order of the songs with how long ago they played, and are refreshed
 * every few seconds with a matching transition, so the songs keep drifting
 * along as time goes by.
 */
export function renderTrack(
  container: HTMLElement,
  options: { did: string; nowPlaying?: string | undefined; pds: string }
) {
  const line = svg("path", { class: "tr-line" });
  const lines = svg("svg", { "aria-hidden": "true", class: "tr-svg" }, [line]);
  const pulse = html("span", { "aria-hidden": "true", class: "tr-pulse" });
  const list = html("ol", { class: "tr-items" });
  const ends = [
    html("span", {
      "aria-hidden": "true",
      class: "tr-end is-start",
      text: "earlier",
    }),
    html("span", {
      "aria-hidden": "true",
      class: "tr-end is-now",
      text: "now",
    }),
  ];
  const board = html("div", { class: "tr" }, [lines, ...ends, pulse, list]);
  container.replaceChildren(board);

  let plays: TrackPlay[] = [];
  const items = new Map<string, HTMLLIElement>();

  const layout = () => {
    const { height, width } = board.getBoundingClientRect();
    const path = createWave(width, height);
    lines.setAttribute("viewBox", `0 0 ${width} ${height}`);
    line.setAttribute("d", path);
    board.style.setProperty("--tr-path", `path("${path}")`);
    if (plays.length > 0) place(true);
  };

  const place = (isFirst = false) => {
    const nowMs = Date.now();
    const oldest = plays.at(-1);
    const span = oldest ? Math.max(nowMs - oldest.at, 30 * 60_000) : 1;

    plays.forEach((play, index) => {
      const item = items.get(play.key);
      if (!item) return;

      const byRank = plays.length > 1 ? index / (plays.length - 1) : 0;
      const byTime = (nowMs - play.at) / span;
      const progress = Math.min(1, byRank * 0.55 + byTime * 0.45);
      const x = NEWEST_AT - progress * (NEWEST_AT - OLDEST_AT);
      const distance = getLengthAtX(line, x * board.clientWidth);

      if (isFirst) item.style.transition = "none";
      item.style.setProperty("--distance", `${distance.toFixed(1)}px`);
      item.querySelector(".tr-time")!.textContent = formatRelative(
        play.at,
        nowMs
      );
      if (isFirst) requestAnimationFrame(() => (item.style.transition = ""));
    });
  };

  const refresh = async () => {
    // Fewer songs on narrow screens, so covers never pile up.
    const limit = board.clientWidth < 600 ? 6 : PLAY_LIMIT;
    const next = (await fetchPlays(options.pds, options.did)).slice(0, limit);
    if (next.length === 0) return;

    const isFirst = plays.length === 0;
    plays = next;
    const keys = new Set(next.map((play) => play.key));

    for (const [key, item] of items) {
      if (keys.has(key)) continue;
      item.classList.add("is-leaving");
      item.addEventListener("transitionend", () => item.remove(), {
        once: true,
      });
      items.delete(key);
    }

    next.forEach((play, index) => {
      let item = items.get(play.key);
      if (!item) {
        item = createItem(play);
        // New songs join at the very end of the track and glide into place.
        item.style.transition = "none";
        item.style.setProperty("--distance", `${line.getTotalLength()}px`);
        list.prepend(item);
        items.set(play.key, item);
        void loadCover(play).then((src) => {
          if (src) item!.querySelector("img")!.src = src;
        });
      }
      item.classList.toggle("is-below", index % 2 === 1);
      item.style.setProperty("--i", String(index));
    });

    requestAnimationFrame(() => {
      for (const item of items.values()) item.style.transition = "";
      place(isFirst);
    });
  };

  const checkPlaying = async () => {
    if (!options.nowPlaying) return;
    try {
      const response = await fetch(options.nowPlaying);
      const data = (await response.json()) as { isPlaying?: boolean };
      board.classList.toggle("is-live", Boolean(data.isPlaying));
    } catch {
      board.classList.remove("is-live");
    }
  };

  layout();
  new ResizeObserver(layout).observe(board);
  void refresh();
  void checkPlaying();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void refresh();
    void checkPlaying();
  }, REFRESH_MS);
  setInterval(() => {
    if (document.visibilityState === "visible") place();
  }, DRIFT_MS);
}

// Spacing songs by horizontal position looks even, while percentages of a
// winding path bunch up where it curves. The path only moves forward along
// x, so a binary search finds the right distance along it.
function getLengthAtX(path: SVGPathElement, x: number) {
  const total = path.getTotalLength();
  let low = 0;
  let high = total;
  for (let step = 0; step < 18; step++) {
    const middle = (low + high) / 2;
    if (path.getPointAtLength(middle).x < x) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function createItem(play: TrackPlay) {
  const label = `${play.title} by ${play.artist}`;
  const cover = html("img", {
    alt: "",
    class: "tr-cover",
    height: 64,
    width: 64,
  });
  const card = html("span", { class: "tr-card" }, [
    html("span", { class: "tr-title", text: play.title }),
    html("span", { class: "tr-artist", text: play.artist }),
    html("span", { class: "tr-time" }),
  ]);
  const content = play.url
    ? html("a", { "aria-label": label, class: "tr-link", href: play.url }, [
        cover,
        card,
      ])
    : html("span", { "aria-label": label, class: "tr-link" }, [cover, card]);

  return html("li", { class: "tr-item" }, [
    html("span", { "aria-hidden": "true", class: "tr-stem" }),
    content,
  ]);
}

// A gentle wave through the board, drawn as a Catmull-Rom curve through
// sampled points, so it looks hand drawn rather than like a sine plot.
function createWave(width: number, height: number) {
  const samples = 14;
  const amplitude = height * 0.26;
  const points = Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples;
    const wave =
      Math.sin(t * Math.PI * 3.1 + 0.4) *
      (0.75 + 0.25 * Math.cos(t * Math.PI * 1.7));
    return { x: t * width, y: height / 2 + wave * amplitude };
  });

  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      const previous = points[index - 1]!;
      const beforePrevious = points[index - 2] ?? previous;
      const next = points[index + 1] ?? point;
      const c1x = previous.x + (point.x - beforePrevious.x) / 6;
      const c1y = previous.y + (point.y - beforePrevious.y) / 6;
      const c2x = point.x - (next.x - previous.x) / 6;
      const c2y = point.y - (next.y - previous.y) / 6;
      return `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    })
    .join(" ");
}

async function fetchPlays(pds: string, did: string): Promise<TrackPlay[]> {
  const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", "fm.teal.feed.play");
  url.searchParams.set("limit", String(PLAY_LIMIT));

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const { records } = (await response.json()) as {
      records: {
        uri: string;
        value: {
          artists?: { artistName: string }[];
          originUri?: string;
          playedTime: string;
          trackName: string;
        };
      }[];
    };

    return records.map(({ uri, value }) => ({
      artist:
        value.artists?.map((artist) => artist.artistName).join(", ") ||
        "Unknown artist",
      at: Date.parse(value.playedTime),
      key: uri,
      title: value.trackName,
      url: value.originUri,
    }));
  } catch {
    return [];
  }
}

// Covers come from Spotify's oEmbed endpoint and are remembered for the
// session, so drifting and refreshing never fetch the same cover twice.
async function loadCover(play: TrackPlay): Promise<string | undefined> {
  if (!play.url?.startsWith("https://open.spotify.com/")) return;

  const cache = readCoverCache();
  if (cache[play.url]) return cache[play.url];

  try {
    const response = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(play.url)}`
    );
    if (!response.ok) return;

    const { thumbnail_url } = (await response.json()) as {
      thumbnail_url?: string;
    };
    if (!thumbnail_url) return;

    cache[play.url] = thumbnail_url;
    try {
      sessionStorage.setItem(COVER_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage is optional.
    }
    return thumbnail_url;
  } catch {
    return;
  }
}

function readCoverCache(): Record<string, string> {
  try {
    return JSON.parse(
      sessionStorage.getItem(COVER_CACHE_KEY) ?? "{}"
    ) as Record<string, string>;
  } catch {
    return {};
  }
}
