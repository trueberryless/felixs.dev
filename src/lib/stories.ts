// Turns the site's data into the small series the landing page charts need.

export interface SeriesPoint {
  label: string;
  title: string;
  value: number;
}

export interface Bubble {
  href?: string | undefined;
  label: string;
  title: string;
  value: number;
}

export interface GanttRow {
  end: number;
  isCurrent: boolean;
  kind: "education" | "work";
  label: string;
  start: number;
  title: string;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

/**
 * Returns one point per calendar month for the `count` months up to `nowMs`,
 * filling quiet months with zero.
 */
export function getMonthlySeries(
  values: Map<string, number>,
  nowMs: number,
  count: number
): SeriesPoint[] {
  const now = new Date(nowMs);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1)
    );
    const key = date.toISOString().slice(0, 7);
    const value = values.get(key) ?? 0;

    return {
      label: MONTH_FORMAT.format(date),
      title: `${MONTH_YEAR_FORMAT.format(date)}: ${value.toLocaleString("en-US")}`,
      value,
    };
  });
}

/**
 * Counts items per `YYYY-MM` month.
 */
export function countByMonth<T>(
  items: T[],
  getDate: (item: T) => string | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const date = getDate(item);
    if (!date || Number.isNaN(Date.parse(date))) continue;
    const key = new Date(date).toISOString().slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface Activity {
  /** How the heading describes doing this most, e.g. "liking things". */
  doing: string;
  label: string;
  value: number;
}

const ACTIVITIES = [
  { doing: "liking things", label: "Likes" },
  { doing: "posting", label: "Posts" },
  { doing: "replying", label: "Replies" },
  { doing: "quoting", label: "Quotes" },
  { doing: "reposting", label: "Reposts" },
  { doing: "following people", label: "Follows" },
  { doing: "starring repos", label: "Stars" },
] as const;

/**
 * Counts what I do on the open social web: likes, posts, replies, quotes and
 * reposts on Bluesky, follows, and stars on Tangled.
 */
export function getSocialActivity(
  records: Map<string, { value: unknown }[]>
): Activity[] {
  const count = (...collections: string[]) =>
    collections.reduce(
      (total, collection) => total + (records.get(collection)?.length ?? 0),
      0
    );

  let posts = 0;
  let replies = 0;
  let quotes = 0;
  for (const { value } of records.get("app.bsky.feed.post") ?? []) {
    const post = value as { embed?: { $type?: string }; reply?: unknown };
    if (post.reply) replies++;
    else if (/embed\.record(WithMedia)?$/.test(post.embed?.$type ?? ""))
      quotes++;
    else posts++;
  }

  const values: Record<(typeof ACTIVITIES)[number]["label"], number> = {
    Follows: count("app.bsky.graph.follow"),
    Likes: count("app.bsky.feed.like"),
    Posts: posts,
    Quotes: quotes,
    Replies: replies,
    Reposts: count("app.bsky.feed.repost"),
    Stars: count("sh.tangled.feed.star", "org.tangled.feed.star"),
  };

  return ACTIVITIES.map(({ doing, label }) => ({
    doing,
    label,
    value: values[label],
  }));
}

/**
 * Parses the resume's month labels ("Apr 2025", "2019") into timestamps for
 * the career timeline.
 */
export function parseResumeDate(label: string | null | undefined): number {
  if (!label) return Number.NaN;
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  return Date.parse(`1 ${label} UTC`);
}
