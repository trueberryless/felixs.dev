// Reads Leaflet documents (`pub.leaflet.content`) into plain shapes for the
// blog.

const FACET_PREFIX = "pub.leaflet.richtext.facet#";
const WORDS_PER_MINUTE = 220;

export interface Segment {
  bold?: boolean;
  code?: boolean;
  footnote?: string;
  italic?: boolean;
  link?: string;
  mention?: string;
  strikethrough?: boolean;
  text: string;
}

export interface Footnote {
  id: string;
  number: number;
  segments: Segment[];
}

interface Facet {
  features?: { $type?: string; [key: string]: unknown }[];
  index?: { byteEnd?: number; byteStart?: number };
}

/**
 * Splits text into segments carrying every covering facet's formatting. Facet
 * ranges are UTF-8 byte offsets, so the text is sliced as bytes.
 */
export function toSegments(plaintext: string, facets: Facet[] = []): Segment[] {
  const bytes = new TextEncoder().encode(plaintext);
  const decoder = new TextDecoder();
  const ranges = facets
    .map((facet) => ({
      end: Math.min(facet.index?.byteEnd ?? 0, bytes.length),
      features: facet.features ?? [],
      start: Math.max(facet.index?.byteStart ?? 0, 0),
    }))
    .filter((range) => range.end > range.start);

  const boundaries = [
    ...new Set([
      0,
      bytes.length,
      ...ranges.flatMap((range) => [range.start, range.end]),
    ]),
  ].toSorted((a, b) => a - b);

  const segments: Segment[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]!;
    const end = boundaries[index + 1]!;
    const segment: Segment = { text: decoder.decode(bytes.slice(start, end)) };

    for (const range of ranges) {
      if (range.start > start || range.end < end) continue;
      for (const feature of range.features) applyFeature(segment, feature);
    }

    segments.push(segment);
  }

  return segments;
}

/** Numbers the footnotes in document order. */
export function collectFootnotes(blocks: unknown[]): Footnote[] {
  const footnotes: Footnote[] = [];

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;

    const value = node as Record<string, unknown>;
    if (
      value.$type === `${FACET_PREFIX}footnote` &&
      typeof value.footnoteId === "string"
    ) {
      if (!footnotes.some((footnote) => footnote.id === value.footnoteId)) {
        footnotes.push({
          id: value.footnoteId,
          number: footnotes.length + 1,
          segments: toSegments(
            String(value.contentPlaintext ?? ""),
            (value.contentFacets as Facet[] | undefined) ?? []
          ),
        });
      }
      return;
    }

    for (const child of Object.values(value)) visit(child);
  };

  visit(blocks);
  return footnotes;
}

/** Estimates a document's reading time from its word count. */
export function getReadingMinutes(blocks: unknown[]): number {
  let words = 0;

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;

    const value = node as Record<string, unknown>;
    if (
      typeof value.plaintext === "string" &&
      value.$type !== "pub.leaflet.blocks.code"
    ) {
      words += value.plaintext.split(/\s+/).filter(Boolean).length;
    }
    for (const child of Object.values(value)) visit(child);
  };

  visit(blocks);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** The blocks of every page of a Leaflet document, in order. */
export function getDocumentBlocks(content: unknown): LeafletBlock[] {
  const pages =
    (
      content as
        { pages?: { blocks?: { block?: LeafletBlock }[] }[] } | undefined
    )?.pages ?? [];

  return pages.flatMap((page) =>
    (page.blocks ?? [])
      .map((entry) => entry.block)
      .filter((block): block is LeafletBlock => Boolean(block?.$type))
  );
}

/** The CID of a blob reference, as `listRecords` and `getRecord` return it. */
export function getBlobCid(blob: unknown): string | undefined {
  const ref = (blob as { ref?: { $link?: string } } | undefined)?.ref;
  return typeof ref?.$link === "string" ? ref.$link : undefined;
}

function applyFeature(
  segment: Segment,
  feature: { $type?: string; [key: string]: unknown }
) {
  switch (feature.$type?.slice(FACET_PREFIX.length)) {
    case "bold":
      segment.bold = true;
      break;
    case "code":
      segment.code = true;
      break;
    case "didMention":
      if (typeof feature.did === "string") segment.mention = feature.did;
      break;
    case "footnote":
      if (typeof feature.footnoteId === "string")
        segment.footnote = feature.footnoteId;
      break;
    case "italic":
      segment.italic = true;
      break;
    case "link":
      if (typeof feature.uri === "string") segment.link = feature.uri;
      break;
    case "strikethrough":
      segment.strikethrough = true;
      break;
  }
}

export interface LeafletBlock {
  $type: string;
  [key: string]: unknown;
}
