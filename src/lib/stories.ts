// Turns the site's data into the small series the landing page charts need.

export interface SeriesPoint {
  label: string;
  title: string;
  value: number;
}

export interface Bubble {
  href?: string | undefined;
  /** Makes the bubble a toggle button that selects this key. */
  key?: string | undefined;
  label: string;
  title: string;
  value: number;
}

export interface GanttRow {
  end: number;
  isCurrent: boolean;
  kind: "education" | "open-source" | "work";
  label: string;
  start: number;
  title: string;
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
 * Counts likes, posts, replies, quotes and reposts on Bluesky, and follows
 * and stars on Bluesky, Tangled and GitHub.
 */
export function getSocialActivity(
  records: Map<string, { value: unknown }[]>,
  github: { following: number; starred: number } | null = null
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
    Follows:
      count("app.bsky.graph.follow", "sh.tangled.graph.follow") +
      (github?.following ?? 0),
    Likes: count("app.bsky.feed.like"),
    Posts: posts,
    Quotes: quotes,
    Replies: replies,
    Reposts: count("app.bsky.feed.repost"),
    Stars:
      count("sh.tangled.feed.star", "org.tangled.feed.star") +
      (github?.starred ?? 0),
  };

  return ACTIVITIES.map(({ doing, label }) => ({
    doing,
    label,
    value: values[label],
  }));
}

/** Parses resume month labels ("Apr 2025", "2019") into timestamps. */
export function parseResumeDate(label: string | null | undefined): number {
  if (!label) return Number.NaN;
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  return Date.parse(`1 ${label} UTC`);
}

interface CareerSource {
  education: {
    degree: string | null;
    endLabel: string | null;
    fieldOfStudy: string | null;
    institution: string;
    isCurrent: boolean;
    startLabel: string;
  }[];
  positions: {
    company: string;
    endLabel: string | null;
    isCurrent: boolean;
    startLabel: string;
    title: string;
  }[];
}

/** Work and education from the resume as rows of the career timeline. */
export function getCareerRows(
  resume: CareerSource | null | undefined,
  nowMs: number
): GanttRow[] {
  return [
    ...(resume?.positions ?? []).map((position) => ({
      end: position.isCurrent ? nowMs : parseResumeDate(position.endLabel),
      isCurrent: position.isCurrent,
      kind: "work" as const,
      label: position.company,
      start: parseResumeDate(position.startLabel),
      title: `${position.title} at ${position.company}`,
    })),
    ...(resume?.education ?? []).map((education) => ({
      end: education.isCurrent ? nowMs : parseResumeDate(education.endLabel),
      isCurrent: education.isCurrent,
      kind: "education" as const,
      label: education.institution,
      start: parseResumeDate(education.startLabel),
      title: [education.degree, education.fieldOfStudy, education.institution]
        .filter(Boolean)
        .join(", "),
    })),
  ]
    .filter((row) => !Number.isNaN(row.start) && !Number.isNaN(row.end))
    .toSorted((a, b) => b.start - a.start);
}

/** How many positions use each skill, by lowercase name. */
export function getSkillUsage(
  positions: { skills: string[] }[]
): Map<string, number> {
  const usage = new Map<string, number>();
  for (const position of positions) {
    for (const skill of new Set(
      position.skills.map((name) => name.toLowerCase())
    )) {
      usage.set(skill, (usage.get(skill) ?? 0) + 1);
    }
  }
  return usage;
}

// My first merged pull request, to Starlight.
const OPEN_SOURCE_SINCE = Date.UTC(2023, 9, 26);
const SHORT_MS = 92 * 24 * 60 * 60 * 1000;

/**
 * The career timeline without short stints like internships, with open source
 * alongside since my first merged pull request.
 */
export function tellCareer(rows: GanttRow[], nowMs: number): GanttRow[] {
  return [
    ...rows.filter((row) => row.end - row.start >= SHORT_MS),
    {
      end: nowMs,
      isCurrent: true,
      kind: "open-source" as const,
      label: "Open source",
      start: OPEN_SOURCE_SINCE,
      title: "Open source, since my first merged pull request to Starlight",
    },
  ].toSorted((a, b) => b.start - a.start);
}

/** Splits a trailing URL off a text, so it can be shown as a link. */
export function splitTrailingLink(text: string | null | undefined): {
  link?: { host: string; url: string };
  text: string;
} {
  const value = (text ?? "").trim();
  const match = /(https?:\/\/\S+?)[.,;:!?)]*$/.exec(value);
  if (!match?.[1] || !URL.canParse(match[1])) return { text: value };
  const url = match[1];
  return {
    link: { host: new URL(url).hostname.replace(/^www\./, ""), url },
    text: value.slice(0, match.index).trim(),
  };
}

/** Skills as bubbles sized by how many positions use them. */
export function getSkillBubbles(
  skills: { name: string }[],
  usage: Map<string, number>
): Bubble[] {
  return skills.map(({ name }) => {
    const uses = usage.get(name.toLowerCase()) ?? 0;
    return {
      label: name,
      title:
        uses > 0
          ? `${name}: used in ${uses} ${uses === 1 ? "position" : "positions"}`
          : name,
      value: (1 + uses * 0.35) ** 2,
    };
  });
}
