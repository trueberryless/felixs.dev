import type { Footnote, Segment } from "./leaflet";

const SAFE_URL_RE = /^(https?:|mailto:)/i;
const GITHUB_PROFILE_RE = /^https:\/\/github\.com\/([\w-]+)\/?$/;
const BSKY_PROFILE_RE = /^https:\/\/bsky\.app\/profile\/([^/?#]+)\/?$/;

export interface RenderOptions {
  /** Turns bare URLs into links, for footnotes without link facets. */
  autolink?: boolean;
  /** Avatars of mentioned Bluesky accounts, by DID or handle. */
  avatars?: Map<string, string>;
}
const FOOTNOTE_MARKER_RE = /^\s*\*\s*$/;

/**
 * Renders rich text as escaped HTML. Links keep only `http(s)` and `mailto`.
 */
export function segmentsToHtml(
  segments: Segment[],
  footnotes: Footnote[] = [],
  options: RenderOptions = {}
): string {
  return segments
    .map((segment) => {
      const footnote = segment.footnote
        ? footnotes.find((candidate) => candidate.id === segment.footnote)
        : undefined;
      // Leaflet marks a footnote with a `*`, which the number replaces.
      if (footnote && FOOTNOTE_MARKER_RE.test(segment.text))
        return renderFootnoteRef(footnote);

      let html =
        options.autolink && !segment.link
          ? linkUrls(segment.text)
          : escapeHtml(segment.text);
      if (segment.code) html = `<code>${html}</code>`;
      if (segment.bold) html = `<strong>${html}</strong>`;
      if (segment.italic) html = `<em>${html}</em>`;
      if (segment.strikethrough) html = `<s>${html}</s>`;
      if (segment.mention) {
        html = renderBadge(
          `https://bsky.app/profile/${segment.mention}`,
          html,
          options.avatars?.get(segment.mention)
        );
      } else if (segment.link && SAFE_URL_RE.test(segment.link)) {
        html = renderLink(segment.link, html, segment.code, options);
      }
      if (footnote) html += renderFootnoteRef(footnote);

      return html;
    })
    .join("");
}

// People get an avatar badge like the GitHub ones: GitHub and Bluesky
// profiles and mentions.
function renderLink(
  url: string,
  html: string,
  isCode: boolean | undefined,
  options: RenderOptions
) {
  if (!isCode) {
    const github = GITHUB_PROFILE_RE.exec(url)?.[1];
    if (github) {
      return renderBadge(
        url,
        html,
        `https://github.com/${github}.png?size=64`,
        "github"
      );
    }
    const bluesky = BSKY_PROFILE_RE.exec(url)?.[1];
    if (bluesky) return renderBadge(url, html, options.avatars?.get(bluesky));
  }
  return `<a href="${escapeHtml(url)}">${html}</a>`;
}

function renderBadge(
  url: string,
  html: string,
  avatar: string | undefined,
  kind = "bluesky"
) {
  const image = avatar
    ? `<img src="${escapeHtml(avatar)}" alt="" width="20" height="20" loading="lazy" decoding="async">`
    : "";
  return `<a class="post-badge is-${kind}" href="${escapeHtml(url)}">${image}<span>${html}</span></a>`;
}

/** The DIDs and handles of every Bluesky account a set of segments names. */
export function collectProfiles(segments: Segment[]): string[] {
  const profiles = new Set<string>();
  for (const segment of segments) {
    if (segment.mention) profiles.add(segment.mention);
    const handle = segment.link && BSKY_PROFILE_RE.exec(segment.link)?.[1];
    if (handle) profiles.add(handle);
  }
  return [...profiles];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isSafeUrl(url: unknown): url is string {
  return typeof url === "string" && SAFE_URL_RE.test(url);
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

// Footnotes often hold a bare URL without a link facet.
function linkUrls(text: string) {
  let html = "";
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT_RE)) {
    html += escapeHtml(text.slice(last, match.index));
    html += `<a href="${escapeHtml(match[0])}">${escapeHtml(match[0])}</a>`;
    last = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

function renderFootnoteRef(footnote: Footnote) {
  return `<sup class="post-footnote-ref"><a id="fnref-${footnote.number}" href="#fn-${footnote.number}" aria-label="Footnote ${footnote.number}">${footnote.number}</a></sup>`;
}
