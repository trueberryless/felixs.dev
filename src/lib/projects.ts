import type { MergedPullRequest } from "./data";

interface Org {
  avatar?: string | undefined;
  name: string;
  owner: string;
  pullRequests: MergedPullRequest[];
  url: string;
}

export interface Lane {
  avatar: string | undefined;
  count: number;
  first: number;
  last: number;
  name: string;
  /** Merge times, oldest first. */
  times: number[];
  url: string;
}

export interface ProjectTotals {
  firstYear: number | undefined;
  organisations: number;
  pullRequests: number;
  repositories: number;
}

/**
 * One lane per organisation with at least one merged pull request, ordered by
 * when I first contributed, so the chart reads like a story from top to
 * bottom.
 */
export function getLanes(orgs: Org[]): Lane[] {
  return orgs
    .map((org) => {
      const times = org.pullRequests
        .map((pr) => Date.parse(pr.mergedAt))
        .filter((time) => !Number.isNaN(time))
        .toSorted((a, b) => a - b);
      return {
        avatar: org.avatar,
        count: times.length,
        first: times[0] ?? 0,
        last: times.at(-1) ?? 0,
        name: org.name,
        times,
        url: org.url,
      };
    })
    .filter((lane) => lane.count > 0)
    .toSorted((a, b) => a.first - b.first);
}

export function getTotals(orgs: Org[]): ProjectTotals {
  const all = orgs.flatMap((org) => org.pullRequests);
  const first = all.reduce<number | undefined>((oldest, pr) => {
    const time = Date.parse(pr.mergedAt);
    return Number.isNaN(time) || (oldest !== undefined && oldest <= time)
      ? oldest
      : time;
  }, undefined);

  return {
    firstYear:
      first === undefined ? undefined : new Date(first).getUTCFullYear(),
    organisations: orgs.filter((org) => org.pullRequests.length > 0).length,
    pullRequests: all.length,
    repositories: new Set(all.map((pr) => pr.repo)).size,
  };
}

/** Merged pull requests per month, from the first one until `nowMs`. */
export function getMonthlyCounts(
  orgs: Org[],
  nowMs: number
): { count: number; month: string }[] {
  const counts = new Map<string, number>();
  for (const pr of orgs.flatMap((org) => org.pullRequests)) {
    const month = pr.mergedAt.slice(0, 7);
    if (month.length === 7) counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const first = [...counts.keys()].toSorted()[0];
  if (!first) return [];

  const [year, month] = first.split("-").map(Number);
  const end = new Date(nowMs).toISOString().slice(0, 7);
  const months: { count: number; month: string }[] = [];
  for (let index = 0; ; index++) {
    const key = new Date(Date.UTC(year!, month! - 1 + index, 1))
      .toISOString()
      .slice(0, 7);
    if (key > end) break;
    months.push({ count: counts.get(key) ?? 0, month: key });
  }
  return months;
}

/** The repositories an organisation's pull requests went to, most first. */
export function getTopRepos(
  pullRequests: MergedPullRequest[],
  limit = 3
): { count: number; name: string }[] {
  const counts = new Map<string, number>();
  for (const pr of pullRequests) {
    counts.set(pr.repo, (counts.get(pr.repo) ?? 0) + 1);
  }
  return [...counts]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ count, name: name.split("/")[1] ?? name }));
}
