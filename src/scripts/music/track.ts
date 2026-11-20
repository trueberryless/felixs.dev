import { formatRelative, html, svg } from "./dom";

const PLAY_LIMIT = 10;
const REFRESH_MS = 60_000;
// The newest song sits near the right end, the oldest near the left.
const NEWEST_AT = 0.9;
const OLDEST_AT = 0.07;
// Each song glides to its place on a critically damped spring: it never
// overshoots and its speed never jumps, even when a new song pushes
// everything along.
const SPRING = 1.6;
const STEM = 18;
const DOT = 5;
const SAMPLES = 320;

interface TrackPlay {
  artist: string;
  /** How many times in a row it played. */
  count: number;
  at: number;
  key: string;
  title: string;
  url: string | undefined;
}

interface Item {
  card: HTMLElement;
  dot: SVGCircleElement;
  element: HTMLLIElement;
  extra: number;
  isLeaving: boolean;
  play: TrackPlay;
  position: number;
  side: 1 | -1;
  stem: SVGLineElement;
  velocity: number;
}

interface Sample {
  x: number;
  y: number;
}

/**
 * Renders recent plays as covers hanging off a winding track. Every cover
 * hangs at a right angle off the track, and the songs keep drifting along as
 * time goes by.
 */
export function renderTrack(
  container: HTMLElement,
  options: { did: string; nowPlaying?: string | undefined; pds: string }
) {
  const line = svg("path", { class: "tr-line" });
  const stems = svg("g", { class: "tr-stems" });
  const dots = svg("g", { class: "tr-dots" });
  const pulse = svg("circle", { class: "tr-pulse", r: DOT });
  const lines = svg("svg", { "aria-hidden": "true", class: "tr-svg" }, [
    line,
    stems,
    dots,
    pulse,
  ]);
  const list = html("ol", { class: "tr-items" });
  const board = html("div", { class: "tr" }, [lines, list]);
  const ends = html("div", { "aria-hidden": "true", class: "tr-ends" }, [
    html("span", { text: "earlier" }),
    html("span", { text: "now" }),
  ]);
  container.replaceChildren(board, ends);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const items = new Map<string, Item>();
  let order: TrackPlay[] = [];
  let samples: Sample[] = [];
  let width = 0;
  let cover = 64;
  let isLive = false;
  let isVisible = false;
  let frame = 0;
  let last = 0;

  const layout = () => {
    width = board.clientWidth;
    const height = board.clientHeight;
    cover =
      Number.parseFloat(
        getComputedStyle(board).getPropertyValue("--tr-cover")
      ) || 64;
    lines.setAttribute("viewBox", `0 0 ${width} ${height}`);
    line.setAttribute("d", createWave(width, height));
    // The path is sampled once, so every frame reads positions from this
    // table instead of asking the browser about the path.
    const total = line.getTotalLength();
    samples = Array.from({ length: SAMPLES + 1 }, (_, index) => {
      const point = line.getPointAtLength((index / SAMPLES) * total);
      return { x: point.x, y: point.y };
    });
    render(performance.now(), true);
  };

  const pointAt = (x: number) => {
    let low = 0;
    let high = samples.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (samples[middle]!.x < x) low = middle;
      else high = middle;
    }
    const a = samples[low]!;
    const b = samples[high]!;
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      nx: -(b.y - a.y) / length,
      ny: (b.x - a.x) / length,
      x,
      y: a.y + (b.y - a.y) * t,
    };
  };

  // How far along the track a song belongs: a mix of its place in the list
  // and how long ago it played, so songs never pile up and gaps still show.
  const targetOf = (item: Item, nowMs: number) => {
    if (item.isLeaving) return 1.15;
    const index = order.indexOf(item.play);
    const oldest = order.at(-1);
    const span = oldest ? Math.max(nowMs - oldest.at, 30 * 60_000) : 1;
    const byRank = order.length > 1 ? index / (order.length - 1) : 0;
    const byTime = (nowMs - item.play.at) / span;
    return Math.min(1, byRank * 0.55 + byTime * 0.45);
  };

  const touchesTrack = (cx: number, cy: number, half: number) => {
    const reach = half + 6;
    return samples.some(
      (sample) =>
        Math.abs(sample.x - cx) < reach && Math.abs(sample.y - cy) < reach
    );
  };

  function render(now: number, snap = false) {
    if (samples.length === 0) return;
    const isStatic = snap || reduced.matches;
    const dt = last && !isStatic ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const nowMs = Date.now();
    const half = cover / 2;
    const margin = half + 6;
    const newestX = Math.min(width * NEWEST_AT, width - margin);
    const oldestX = Math.max(width * OLDEST_AT, margin);

    for (const [key, item] of items) {
      const target = targetOf(item, nowMs);
      if (isStatic) {
        item.position = target;
        item.velocity = 0;
      } else {
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let step = 0; step < steps; step++) {
          const acceleration =
            SPRING * SPRING * (target - item.position) -
            2 * SPRING * item.velocity;
          item.velocity += acceleration * h;
          item.position += item.velocity * h;
        }
      }

      if (item.isLeaving && item.position > 1.1) {
        item.element.remove();
        item.stem.remove();
        item.dot.remove();
        items.delete(key);
        continue;
      }

      const x = newestX + (oldestX - newestX) * item.position;
      const point = pointAt(Math.min(Math.max(x, 0), width));
      const flip = Math.sign(point.ny) === item.side ? 1 : -1;
      const nx = point.nx * flip;
      const ny = point.ny * flip;
      const base = STEM + half / Math.max(Math.abs(nx), Math.abs(ny));

      // Where the track curves towards a cover, it moves further out.
      let needed = 0;
      while (
        needed < 80 &&
        touchesTrack(
          point.x + nx * (base + needed),
          point.y + ny * (base + needed),
          half
        )
      ) {
        needed += 4;
      }
      item.extra = isStatic
        ? needed
        : item.extra + (needed - item.extra) * Math.min(1, dt * 6);
      const distance = base + item.extra;
      // Covers stay whole on screen, however narrow the board gets.
      const cx = Math.min(
        Math.max(point.x + nx * distance, half),
        width - half
      );
      const cy = point.y + ny * distance;

      const opacity = Math.min(
        1,
        Math.max(0, 1 + item.position * 8),
        Math.max(0, (1.1 - item.position) * 8)
      ).toFixed(3);
      item.element.style.translate = `${(cx - half).toFixed(1)}px ${(cy - half).toFixed(1)}px`;
      item.element.style.opacity = opacity;
      item.element.classList.toggle("is-below", item.side === 1);
      item.stem.setAttribute("x1", point.x.toFixed(1));
      item.stem.setAttribute("y1", point.y.toFixed(1));
      item.stem.setAttribute(
        "x2",
        (point.x + nx * (STEM + item.extra)).toFixed(1)
      );
      item.stem.setAttribute(
        "y2",
        (point.y + ny * (STEM + item.extra)).toFixed(1)
      );
      item.stem.style.opacity = opacity;
      item.dot.setAttribute("cx", point.x.toFixed(1));
      item.dot.setAttribute("cy", point.y.toFixed(1));
      item.dot.style.opacity = opacity;
    }

    if (isLive) {
      const progress = reduced.matches ? 0 : (now / 6000) % 1;
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      const point = pointAt(newestX + (oldestX - newestX) * eased);
      pulse.setAttribute("cx", point.x.toFixed(1));
      pulse.setAttribute("cy", point.y.toFixed(1));
    }
  }

  const loop = (now: number) => {
    render(now);
    frame =
      isVisible && document.visibilityState === "visible"
        ? requestAnimationFrame(loop)
        : 0;
  };
  const start = () => {
    if (frame || reduced.matches) return;
    last = 0;
    frame = requestAnimationFrame(loop);
  };

  const refresh = async () => {
    // Fewer songs on narrow screens, so covers never pile up.
    const limit = Math.min(
      PLAY_LIMIT,
      Math.max(4, Math.floor(width / (cover * 1.7)))
    );
    const next = (await fetchPlays(options.pds, options.did)).slice(0, limit);
    if (next.length === 0) return;

    const isFirst = items.size === 0;
    const keys = new Set(next.map((play) => play.key));
    for (const item of items.values()) {
      if (!keys.has(item.play.key)) item.isLeaving = true;
    }

    // New songs join just past the right end, on the side opposite the song
    // before them, and every song keeps its side for good.
    let newest = order[0] ? items.get(order[0].key) : undefined;
    for (const play of next.toReversed()) {
      const existing = items.get(play.key);
      if (existing) {
        if (existing.play.count !== play.count) {
          const fresh = createItem(play, existing.side);
          existing.element.replaceChildren(...fresh.element.childNodes);
          existing.card = fresh.card;
        }
        existing.play = play;
        continue;
      }
      const item = createItem(play, newest ? (-newest.side as 1 | -1) : -1);
      item.position = -0.15;
      items.set(play.key, item);
      list.prepend(item.element);
      stems.append(item.stem);
      dots.append(item.dot);
      newest = item;
    }
    order = next.map((play) => items.get(play.key)!.play);

    const nowMs = Date.now();
    for (const item of items.values()) {
      item.card.querySelector(".tr-time")!.textContent = formatRelative(
        item.play.at,
        nowMs
      );
    }
    render(performance.now(), isFirst || reduced.matches);
  };

  const checkPlaying = async () => {
    if (!options.nowPlaying) return;
    try {
      const response = await fetch(options.nowPlaying);
      const data = (await response.json()) as { isPlaying?: boolean };
      isLive = Boolean(data.isPlaying);
    } catch {
      isLive = false;
    }
    board.classList.toggle("is-live", isLive);
    render(performance.now(), reduced.matches);
  };

  layout();
  new ResizeObserver(layout).observe(board);
  new IntersectionObserver(([entry]) => {
    isVisible = Boolean(entry?.isIntersecting);
    if (isVisible) start();
  }).observe(board);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isVisible) start();
  });
  void refresh();
  void checkPlaying();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void refresh();
    void checkPlaying();
  }, REFRESH_MS);
}

function createItem(play: TrackPlay, side: 1 | -1): Item {
  const label = `${play.title} by ${play.artist}${play.count > 1 ? `, ${play.count} times in a row` : ""}`;
  const id = /open\.spotify\.com\/track\/([A-Za-z0-9]{22})/.exec(
    play.url ?? ""
  )?.[1];
  const image = html("img", {
    alt: "",
    class: "tr-cover",
    decoding: "async",
    height: 64,
    src: id ? `/api/cover/${id}` : undefined,
    width: 64,
  });
  image.addEventListener("error", () => image.removeAttribute("src"), {
    once: true,
  });
  const card = html("span", { class: "tr-card" }, [
    html("span", { class: "tr-title", text: play.title }),
    html("span", { class: "tr-artist", text: play.artist }),
    play.count > 1 &&
      html("span", {
        class: "tr-repeat",
        text: `${play.count} times in a row`,
      }),
    html("span", { class: "tr-time" }),
  ]);
  const badge =
    play.count > 1
      ? html("span", {
          "aria-hidden": "true",
          class: "tr-count",
          text: `×${play.count}`,
        })
      : undefined;
  const content = play.url
    ? html("a", { "aria-label": label, class: "tr-link", href: play.url }, [
        image,
        badge,
        card,
      ])
    : html("span", { "aria-label": label, class: "tr-link" }, [
        image,
        badge,
        card,
      ]);

  return {
    card,
    dot: svg("circle", { class: "tr-dot", r: DOT }),
    element: html("li", { class: "tr-item" }, [content]),
    extra: 0,
    isLeaving: false,
    play,
    position: 0,
    side,
    stem: svg("line", { class: "tr-stem" }),
    velocity: 0,
  };
}

// A gentle wave through the middle of the board, drawn as a Catmull-Rom
// curve through sampled points, so it looks hand drawn rather than like a
// sine plot. It stays in a narrow band, so covers fit on both sides.
function createWave(width: number, height: number) {
  const samples = 14;
  const amplitude = height * 0.12;
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
  // Enough to fill the track even when a song played many times in a row.
  url.searchParams.set("limit", "60");

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

    // A song played several times in a row becomes one stop on the track.
    const plays: TrackPlay[] = [];
    for (const { uri, value } of records) {
      const artist =
        value.artists?.map((entry) => entry.artistName).join(", ") ||
        "Unknown artist";
      const previous = plays.at(-1);
      const same =
        previous &&
        (value.originUri
          ? previous.url === value.originUri
          : previous.title === value.trackName && previous.artist === artist);
      // The group is known by its first play, so it stays the same stop
      // when the song plays once more.
      if (same) {
        previous.count++;
        previous.key = uri;
        continue;
      }
      plays.push({
        artist,
        at: Date.parse(value.playedTime),
        count: 1,
        key: uri,
        title: value.trackName,
        url: value.originUri,
      });
    }
    return plays.slice(0, PLAY_LIMIT);
  } catch {
    return [];
  }
}
