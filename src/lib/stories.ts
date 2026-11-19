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

// Lexicon namespaces are reversed domains, so `fm.teal.feed.play` belongs to
// teal.fm. A few apps publish under a different domain than they live on.
const APP_NAMES: Record<string, string> = {
  "app.bsky": "Bluesky",
  "chat.bsky": "Bluesky",
  "fm.teal": "teal.fm",
  "org.tangled": "Tangled",
  "sh.tangled": "Tangled",
};

/**
 * Groups record counts per collection into one bubble per app.
 */
export function getFootprint(
  collections: Map<string, number>,
  options: { did: string; limit: number }
): Bubble[] {
  const apps = new Map<string, { collections: number; records: number }>();

  for (const [collection, count] of collections) {
    const namespace = collection.split(".").slice(0, 2).join(".");
    const app =
      APP_NAMES[namespace] ?? namespace.split(".").toReversed().join(".");
    const entry = apps.get(app) ?? { collections: 0, records: 0 };
    entry.collections++;
    entry.records += count;
    apps.set(app, entry);
  }

  return [...apps]
    .toSorted((a, b) => b[1].records - a[1].records)
    .slice(0, options.limit)
    .map(([app, entry]) => ({
      href: `https://pdsls.dev/at://${options.did}`,
      label: app,
      title: `${app}: ${entry.records.toLocaleString("en-US")} records in ${entry.collections} ${entry.collections === 1 ? "collection" : "collections"}`,
      value: entry.records,
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
