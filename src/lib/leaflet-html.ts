import type { Footnote, Segment } from "./leaflet";

const SAFE_URL_RE = /^(https?:|mailto:)/i;
const FOOTNOTE_MARKER_RE = /^\s*\*\s*$/;

/**
 * Renders rich text segments as HTML. All text and attributes are escaped,
 * and links only keep `http(s)` and `mailto` URLs.
 */
export function segmentsToHtml(
  segments: Segment[],
  footnotes: Footnote[] = [],
  options: { autolink?: boolean } = {}
): string {
  return segments
    .map((segment) => {
      const footnote = segment.footnote
        ? footnotes.find((candidate) => candidate.id === segment.footnote)
        : undefined;
      // Leaflet marks a footnote with a `*` in the text, which the number replaces.
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
        html = `<a class="post-mention" href="https://bsky.app/profile/${escapeHtml(segment.mention)}">${html}</a>`;
      } else if (segment.link && SAFE_URL_RE.test(segment.link)) {
        html = `<a href="${escapeHtml(segment.link)}">${html}</a>`;
      }
      if (footnote) html += renderFootnoteRef(footnote);

      return html;
    })
    .join("");
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
