import {
  actorDid,
  bskyPublicApi,
  constellationEndpoint,
  pdsEndpoint,
  slingshotEndpoint,
} from "./const";

const GITHUB_API = "https://api.github.com";
const GITHUB_USERNAME = "trueberryless";
const GITHUB_ORG = "trueberryless-org";
const TIMEOUT_MS = 15000;

const SHOWCASE_ORGS: [string, string][] = [
  ["withastro", "Build fast websites, faster"],
  ["npmx-dev", "A fast, modern browser for the npm registry"],
  [
    "all-contributors",
    "Recognize all contributors, not just the ones who push code",
  ],
  ["withstudiocms", "The Astro-native CMS for all your needs"],
  ["catppuccin", "Soothing pastel theme for the high-spirited"],
  [
    "rose-pine",
    "All natural pine, faux fur and a bit of soho vibes for the classy minimalist",
  ],
  ["bombshell-dev", "Modern and powerful CLI tooling"],
  ["emdash-cms", "A fast and lightweight CMS for Astro"],
  ["zen-browser", "Stay focused, browse faster"],
  ["colibri-social", "Open source chat platform built on the AT protocol"],
];

async function jsonFetch<T = any>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function batchAll<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

function getGithubToken(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  const token = getGithubToken();
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

const GITHUB_MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GitHub fetch with per-request timeout and rate-limit-aware retries.
 *
 * GitHub's Search API in particular enforces a low secondary rate limit
 * (~30 req/min authenticated). When we hit it, GitHub answers 403/429 with a
 * `Retry-After` header (or `x-ratelimit-reset` when the primary budget is
 * exhausted). We honour those and retry instead of silently dropping data,
 * which is what previously caused undercounted contributions.
 */
async function githubFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...githubHeaders(), ...init.headers },
        signal: controller.signal,
      });
    } catch (err) {
      // Transient network failure (ECONNRESET, timeout abort, DNS, ...).
      // Retry with backoff so a single blip doesn't undercount contributions.
      if (attempt < GITHUB_MAX_RETRIES) {
        const waitMs = Math.min(2 ** attempt * 1000, 30000);
        console.warn(
          `[data] GitHub network error, retrying in ${Math.round(
            waitMs / 1000
          )}s: ${url}`
        );
        await sleep(waitMs);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const rateLimited =
      res.status === 429 ||
      (res.status === 403 &&
        (res.headers.get("x-ratelimit-remaining") === "0" ||
          res.headers.has("retry-after")));

    if (rateLimited && attempt < GITHUB_MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const reset = res.headers.get("x-ratelimit-reset");
      let waitMs: number;
      if (retryAfter) {
        waitMs = Number(retryAfter) * 1000;
      } else if (reset) {
        waitMs = Number(reset) * 1000 - Date.now();
      } else {
        waitMs = 2 ** attempt * 1000;
      }
      waitMs = Math.min(Math.max(waitMs, 1000), 60000);
      console.warn(
        `[data] GitHub rate limited (${res.status}), retrying in ${Math.round(
          waitMs / 1000
        )}s: ${url}`
      );
      await sleep(waitMs);
      continue;
    }

    return res;
  }
}

async function githubJson<T = any>(url: string): Promise<T> {
  const res = await githubFetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} - ${url}`);
  return (await res.json()) as T;
}

async function paginateGithub(url: string): Promise<any[]> {
  const items: any[] = [];
  let next: string | null = url;
  while (next) {
    const res = await githubFetch(next);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    items.push(...(await res.json()));
    const link = res.headers.get("link") || "";
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    next = match ? match[1] : null;
  }
  return items;
}

const titleCase = (name: string) =>
  name
    .replace(/[-_]/g, " ")
    .replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

interface OwnProject {
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
}

interface ContributedOrg {
  owner: string;
  name: string;
  description: string;
  url: string;
  stars: number;
  contributions: number;
}

export interface ProjectsData {
  ownProjects: OwnProject[];
  contributedProjects: ContributedOrg[];
}

async function fetchOwnRepos(): Promise<OwnProject[]> {
  const [user, org] = await Promise.all([
    paginateGithub(`${GITHUB_API}/users/${GITHUB_USERNAME}/repos?per_page=100`),
    paginateGithub(`${GITHUB_API}/orgs/${GITHUB_ORG}/repos?per_page=100`),
  ]);
  return [...user, ...org]
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, 8)
    .map((r) => ({
      name: titleCase(r.name),
      description: r.description ?? null,
      url: r.html_url,
      stars: r.stargazers_count ?? 0,
      language: r.language ?? null,
    }));
}

async function searchPRs(owner: string) {
  const items: any[] = [];
  let totalCount = 0;
  const perPage = 100;
  // GitHub's Search API hard-caps at 1000 results (10 pages x 100), so this is
  // the maximum retrievable. `total_count` still reports the true total.
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    let data: { items: any[]; total_count: number } | null = null;
    try {
      data = await githubJson<{ items: any[]; total_count: number }>(
        `${GITHUB_API}/search/issues?q=${encodeURIComponent(
          `type:pr is:merged author:${GITHUB_USERNAME} user:${owner}`
        )}&per_page=${perPage}&page=${page}`
      );
    } catch (err) {
      // A genuine failure after retries: keep what we have but flag it so an
      // undercount is visible in logs rather than passing silently.
      console.warn(`[data] searchPRs incomplete for ${owner}:`, err);
      break;
    }

    totalCount = data.total_count ?? totalCount;
    items.push(...(data.items ?? []));
    if (!data.items?.length || items.length >= totalCount) break;
  }

  return { items, totalCount: totalCount || items.length };
}

async function fetchOrg(
  owner: string,
  description: string
): Promise<ContributedOrg> {
  const [search, profile] = await Promise.all([
    searchPRs(owner).catch(() => ({ items: [], totalCount: 0 })),
    githubJson<any>(`${GITHUB_API}/users/${owner}`).catch(() => null),
  ]);

  const repoNames = new Set<string>();
  for (const pr of search.items) {
    const nameWithOwner = pr.repository_url?.split("/").slice(-2).join("/");
    if (nameWithOwner) repoNames.add(nameWithOwner);
  }

  const stars = await batchAll([...repoNames], 5, (n) =>
    githubJson<any>(`${GITHUB_API}/repos/${n}`)
      .then((r) => r.stargazers_count || 0)
      .catch(() => 0)
  );

  const url = profile?.blog?.startsWith("http")
    ? profile.blog
    : profile?.blog
      ? `https://${profile.blog}`
      : `https://github.com/${owner}`;

  return {
    owner,
    name: profile?.name || owner,
    description: description || profile?.bio || "",
    url,
    stars: stars.reduce((a, b) => a + b, 0),
    contributions: search.totalCount,
  };
}

export async function fetchProjects(): Promise<ProjectsData | null> {
  if (!getGithubToken()) {
    console.warn("[data] GITHUB_TOKEN not set, projects will be empty");
    return null;
  }
  const [own, contributed] = await Promise.allSettled([
    fetchOwnRepos(),
    // Low concurrency: the Search API secondary rate limit is strict, so we
    // trade a little build time for complete, reliable contribution counts.
    batchAll(SHOWCASE_ORGS, 2, ([o, d]) => fetchOrg(o, d)),
  ]);
  const ownProjects = own.status === "fulfilled" ? own.value : [];
  const contributedProjects =
    contributed.status === "fulfilled" ? contributed.value : [];
  const hasSignal =
    ownProjects.length > 0 || contributedProjects.some((p) => p.stars > 0);
  if (!hasSignal) return null;
  return { ownProjects, contributedProjects };
}

async function fetchATproto(
  collection: string,
  maxItems?: number
): Promise<any[]> {
  const records: any[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pdsEndpoint);
    url.searchParams.set("repo", actorDid);
    url.searchParams.set("collection", collection);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await jsonFetch<{ records: any[]; cursor?: string }>(
      url.toString()
    );
    records.push(...(data.records || []));
    cursor = data.cursor;
    if (maxItems && records.length >= maxItems) {
      records.length = maxItems;
      break;
    }
  } while (cursor);
  return records.map((r) => ({ id: r.uri, data: r.value }));
}

export interface AugmentedPost {
  id: string;
  data: {
    title: string;
    publishedAt: string;
    tags?: string[];
    path?: string;
    site?: string;
    publication?: { name?: string; url?: string } | null;
  };
}

export async function fetchPosts(): Promise<AugmentedPost[] | null> {
  const [posts, publications] = await Promise.allSettled([
    fetchATproto("site.standard.document"),
    fetchATproto("site.standard.publication"),
  ]);
  const rawPosts = posts.status === "fulfilled" ? posts.value : [];
  const rawPubs = publications.status === "fulfilled" ? publications.value : [];
  if (rawPosts.length === 0) return null;

  const pubMap: Record<string, any> = {};
  for (const p of rawPubs) pubMap[p.id] = p.data;

  const augmentedPosts: AugmentedPost[] = [];
  for (const post of rawPosts) {
    const publishedAt = post?.data?.publishedAt;
    if (
      typeof publishedAt !== "string" ||
      !Number.isFinite(Date.parse(publishedAt))
    ) {
      continue;
    }

    augmentedPosts.push({
      ...post,
      data: { ...post.data, publication: pubMap[post.data.site] || null },
    });
  }

  return augmentedPosts.length > 0 ? augmentedPosts : null;
}

function isFinished(status: unknown): boolean {
  return status === "buzz.bookhive.defs#finished" || status === "Finished";
}

export interface Book {
  id: string;
  hiveId: string;
  title: string;
  authors: string;
  coverUrl: string | null;
  rotation: string;
  thickness: number;
  finishedAt?: string;
  startedAt?: string;
  stars?: number;
}

function processBook(raw: any): Book {
  let pages = raw.data.bookProgress?.totalPages;
  if (!pages) {
    let hash = 0;
    const text = raw.data.title || raw.id;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    pages = Math.abs(hash % 500) + 200;
  }
  const cover = raw.data.cover;
  const coverUrl = cover?.ref?.$link
    ? `${pdsEndpoint}/xrpc/com.atproto.sync.getBlob?did=${actorDid}&cid=${cover.ref.$link}`
    : null;
  return {
    id: raw.id,
    hiveId: raw.data.hiveId,
    title: raw.data.title,
    authors: raw.data.authors,
    coverUrl,
    rotation: (Math.random() * 8 - 4).toFixed(2),
    thickness: Math.round(Math.max(10, Math.min(60, 8 + pages * 0.04))),
    finishedAt: raw.data.finishedAt,
    startedAt: raw.data.startedAt,
    stars: raw.data.stars,
  };
}

export async function fetchBooks(): Promise<Book[] | null> {
  const raw = await fetchATproto("buzz.bookhive.book").catch(() => []);
  if (raw.length === 0) return null;
  return raw
    .filter((b: any) => isFinished(b.data.status))
    .sort((a: any, b: any) => {
      const dateA = a.data.finishedAt || a.data.startedAt || a.data.createdAt;
      const dateB = b.data.finishedAt || b.data.startedAt || b.data.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .map(processBook);
}

async function fetchRecord(uri: string): Promise<any | null> {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, repo, collection, rkey] = match;
  for (const base of [slingshotEndpoint, bskyPublicApi]) {
    try {
      const url = new URL("/xrpc/com.atproto.repo.getRecord", base);
      url.searchParams.set("repo", repo);
      url.searchParams.set("collection", collection);
      url.searchParams.set("rkey", rkey);
      const data = await jsonFetch<any>(url.toString());
      return data.value ?? null;
    } catch {}
  }
  return null;
}

async function fetchProfile(did: string): Promise<any | null> {
  return await jsonFetch<any>(
    `${bskyPublicApi}/xrpc/app.bsky.actor.getProfile?actor=${did}`
  ).catch(() => null);
}

async function fetchBacklinks(subject: string): Promise<string[]> {
  const url = new URL(
    "/xrpc/blue.microcosm.links.getBacklinks",
    constellationEndpoint
  );
  url.searchParams.set("subject", subject);
  url.searchParams.set("source", "community.lexicon.calendar.rsvp:subject.uri");
  const data = await jsonFetch<any>(url.toString()).catch(() => ({}));
  const list = data.links || data.records || data.items || data.backlinks || [];
  return list
    .map((item: any) => {
      if (typeof item === "string") return item;
      if (item?.uri) return item.uri;
      if (item?.did && item?.collection && item?.rkey)
        return `at://${item.did}/${item.collection}/${item.rkey}`;
      return item?.source;
    })
    .filter((u: any) => typeof u === "string" && u.startsWith("at://"));
}

export interface Event {
  id: string;
  data: any;
  startDate: string;
  endDate: string;
  atmoUrl: string;
  locationText: string;
  attendees: string[];
  totalAttendees: number;
  imageUrl: string | null;
}

export async function fetchEvents(): Promise<Event[] | null> {
  const rsvps = await fetchATproto("community.lexicon.calendar.rsvp").catch(
    () => []
  );
  if (rsvps.length === 0) return null;

  const uris = [
    ...new Set(
      rsvps
        .map((r: any) => {
          const ref = r.data?.event || r.data?.subject;
          return typeof ref === "string" ? ref : ref?.uri;
        })
        .filter((u: any) => typeof u === "string" && u.startsWith("at://"))
    ),
  ] as string[];

  const [records, backlinks] = await Promise.all([
    batchAll(uris, 10, fetchRecord),
    batchAll(uris, 10, fetchBacklinks),
  ]);

  const dids = new Set<string>();
  uris.forEach((u) => {
    const m = u.match(/^at:\/\/([^/]+)\//);
    if (m) dids.add(m[1]);
  });
  backlinks.forEach((ls) =>
    ls.forEach((l) => {
      const m = l.match(/^at:\/\/([^/]+)\//);
      if (m) dids.add(m[1]);
    })
  );

  const profileList = await batchAll([...dids], 10, fetchProfile);
  const profiles: Record<string, any> = {};
  [...dids].forEach((d, i) => (profiles[d] = profileList[i]));

  const processed = uris
    .map((uri, i) => {
      const value = records[i];
      if (!value?.name) return null;
      const did = uri.match(/^at:\/\/([^/]+)\//)?.[1] ?? "";
      const rkey = uri.match(/^at:\/\/[^/]+\/[^/]+\/(.+)$/)?.[1] ?? "";
      const rawStart = value.startsAt || value.createdAt;
      if (
        typeof rawStart !== "string" ||
        !Number.isFinite(Date.parse(rawStart))
      ) {
        return null;
      }
      const startDate = rawStart;
      const endDate =
        typeof value.endsAt === "string" &&
        Number.isFinite(Date.parse(value.endsAt))
          ? value.endsAt
          : startDate;
      const atmoUrl =
        rkey && did
          ? `https://atmo.rsvp/p/${did}/e/${rkey}`
          : "https://atmo.rsvp/";

      let locationText = "";
      if (Array.isArray(value.locations) && value.locations.length > 0) {
        const loc = value.locations[0];
        locationText = loc.name || loc.street || loc.city || loc.address || "";
      }

      const attendeeDids = [
        ...new Set(
          backlinks[i]
            .map((l) => l.match(/^at:\/\/([^/]+)\//)?.[1])
            .filter(Boolean)
        ),
      ] as string[];
      const attendees = attendeeDids
        .map((d) => profiles[d]?.avatar)
        .filter((a): a is string => Boolean(a))
        .slice(0, 5);

      let imageUrl: string | null = null;
      if (Array.isArray(value.media)) {
        const thumb = value.media.find(
          (m: any) => m.role === "thumbnail" || m.content?.$type === "blob"
        );
        if (thumb?.content?.ref?.$link && did)
          imageUrl = `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${thumb.content.ref.$link}@jpeg`;
      }

      return {
        id: uri,
        data: value,
        startDate,
        endDate,
        atmoUrl,
        locationText,
        attendees,
        totalAttendees: attendeeDids.length,
        imageUrl,
      };
    })
    .filter((e): e is Event => e !== null);

  return processed.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
}

export interface BlueskyPost {
  id: string;
  rkey: string;
  postUrl: string;
  text: string;
  likes: number;
  createdAt: string;
}

export async function fetchBluesky(): Promise<BlueskyPost[] | null> {
  const raw = await fetchATproto("app.bsky.feed.post", 100).catch(() => []);
  if (raw.length === 0) return null;

  const uris = raw.map((p: any) => p.id);
  const likeCounts: Record<string, number> = {};
  const chunks = Array.from({ length: Math.ceil(uris.length / 25) }, (_, i) =>
    uris.slice(i * 25, i * 25 + 25)
  );
  await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams();
      chunk.forEach((u: string) => params.append("uris", u));
      try {
        const data = await jsonFetch<any>(
          `${bskyPublicApi}/xrpc/app.bsky.feed.getPosts?${params.toString()}`
        );
        for (const p of data.posts || []) likeCounts[p.uri] = p.likeCount || 0;
      } catch {}
    })
  );

  return raw.map((p: any) => {
    const rkey = p.id.split("/").pop();
    return {
      id: p.id,
      rkey,
      postUrl: `https://bsky.app/profile/${actorDid}/post/${rkey}`,
      text: p.data.text,
      likes: likeCounts[p.id] || 0,
      createdAt: p.data.createdAt,
    };
  });
}

interface ResumeSkill {
  id: string;
  name: string;
  category: string | null;
}

interface ResumePosition {
  id: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  workplaceType: string | null;
  description: string | null;
  startLabel: string;
  endLabel: string | null;
  isCurrent: boolean;
  skills: string[];
}

interface ResumeEducation {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  grade: string | null;
  description: string | null;
  startLabel: string;
  endLabel: string | null;
  isCurrent: boolean;
}

interface ResumeHonor {
  id: string;
  title: string;
  issuer: string | null;
  awardedAt: string | null;
  description: string | null;
}

export interface ResumeData {
  positions: ResumePosition[];
  education: ResumeEducation[];
  honors: ResumeHonor[];
  skills: ResumeSkill[];
}

function formatMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
  }
  if (/^\d{4}$/.test(value)) return value;
  const ts = Date.parse(value);
  return Number.isFinite(ts)
    ? new Date(ts).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      })
    : value;
}

function dateTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    return new Date(y, m - 1, 1).getTime();
  }
  if (/^\d{4}$/.test(value)) return new Date(Number(value), 0, 1).getTime();
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function fragmentLabel(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const frag = ref.includes("#") ? (ref.split("#").pop() ?? ref) : ref;
  const spaced = frag.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria",
  CH: "Switzerland",
  DE: "Germany",
  GB: "United Kingdom",
  NL: "Netherlands",
  US: "United States",
};

function formatLocation(loc: any): string | null {
  if (!loc || typeof loc !== "object") return null;
  const country =
    typeof loc.country === "string" && loc.country.length === 2
      ? COUNTRY_NAMES[loc.country] || loc.country
      : loc.country;
  const parts = [loc.locality, loc.region]
    .filter(Boolean)
    .filter((p, i, arr) => arr.indexOf(p) === i);
  if (country) parts.push(country);
  return parts.length > 0 ? parts.join(", ") : null;
}

const byStartDesc = (a: { startLabel: string }, b: { startLabel: string }) =>
  dateTimestamp(b.startLabel) - dateTimestamp(a.startLabel);

export async function fetchResume(): Promise<ResumeData | null> {
  const [positionsRaw, educationRaw, honorsRaw, skillsRaw] = await Promise.all([
    fetchATproto("id.sifa.profile.position"),
    fetchATproto("id.sifa.profile.education"),
    fetchATproto("id.sifa.profile.honor"),
    fetchATproto("id.sifa.profile.skill"),
  ]);

  if (
    positionsRaw.length === 0 &&
    educationRaw.length === 0 &&
    honorsRaw.length === 0 &&
    skillsRaw.length === 0
  ) {
    return null;
  }

  const skills: ResumeSkill[] = skillsRaw
    .map((s: any) => {
      const rawCategory = s.data?.category;
      return {
        id: s.id,
        name: s.data?.name,
        category:
          typeof rawCategory === "string" ? fragmentLabel(rawCategory) : null,
      };
    })
    .filter((s) => Boolean(s.name));
  const skillNames = new Map(skills.map((s) => [s.id, s.name]));

  const positions: ResumePosition[] = positionsRaw
    .map((r: any) => {
      const d = r.data ?? {};
      const startLabel = formatMonth(d.startedAt);
      const end = d.endedAt;
      const isCurrent = !end && Boolean(startLabel);
      const skillRefs = Array.isArray(d.skills) ? d.skills : [];
      return {
        id: r.id,
        title: d.title,
        company: d.company,
        location: formatLocation(d.location),
        jobType: fragmentLabel(d.employmentType),
        workplaceType: fragmentLabel(d.workplaceType),
        description: d.description,
        startLabel: startLabel ?? "—",
        endLabel: isCurrent ? "Present" : formatMonth(end),
        isCurrent,
        skills: skillRefs
          .map((s: any) => (typeof s === "string" ? s : s?.uri))
          .map((uri: string) => skillNames.get(uri) as string)
          .filter(Boolean),
      };
    })
    .filter((p) => Boolean(p.title))
    .sort(byStartDesc);

  const education: ResumeEducation[] = educationRaw
    .map((r: any) => {
      const d = r.data ?? {};
      const startLabel = formatMonth(d.startedAt);
      const end = d.endedAt;
      const isCurrent = !end && Boolean(startLabel);
      return {
        id: r.id,
        institution: d.institution,
        degree: d.degree,
        fieldOfStudy: d.fieldOfStudy,
        grade: d.grade,
        description: d.description,
        startLabel: startLabel ?? "—",
        endLabel: isCurrent ? "Present" : formatMonth(end),
        isCurrent,
      };
    })
    .filter((e) => Boolean(e.institution))
    .sort(byStartDesc);

  const honors: ResumeHonor[] = honorsRaw
    .map((r: any) => {
      const d = r.data ?? {};
      return {
        id: r.id,
        title: d.title,
        issuer: d.issuer,
        awardedAt: formatMonth(d.awardedAt),
        description: d.description,
      };
    })
    .filter((h) => Boolean(h.title))
    .sort((a, b) => dateTimestamp(a.awardedAt) - dateTimestamp(b.awardedAt));

  return { positions, education, honors, skills };
}

export interface ReadingSummary {
  latest: { title: string; hiveId: string; startedAt?: string };
  favorites: { title: string; hiveId: string; stars: number }[];
}

export function buildReadingSummary(books: Book[]): ReadingSummary | null {
  if (books.length === 0) return null;
  const sorted = [...books].sort((a, b) => {
    const dateA = new Date(a.finishedAt || a.startedAt || 0).getTime();
    const dateB = new Date(b.finishedAt || b.startedAt || 0).getTime();
    return dateB - dateA;
  });
  const latest = sorted[0];
  const favorites = [...books]
    .filter((b) => typeof b.stars === "number")
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .filter((b) => b.hiveId !== latest.hiveId)
    .slice(0, 3)
    .map((b) => ({ title: b.title, hiveId: b.hiveId, stars: b.stars! }));
  return {
    latest: {
      title: latest.title,
      hiveId: latest.hiveId,
      startedAt: latest.startedAt,
    },
    favorites,
  };
}
