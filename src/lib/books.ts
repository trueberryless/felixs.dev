// Page counts in this range map linearly to spine thickness. Fixed bounds keep
// one very long book from squeezing all others together.
const PAGES = { max: 900, min: 150 } as const;
const THICKNESS_PX = { max: 58, min: 14 } as const;
// Share of the range at each end that eases into the limit, so outliers still
// differ.
const KNEE = 0.15;

/**
 * Page count to thickness in pixels: linear for typical books, easing
 * quadratically into the minimum and maximum.
 */
export function getBookThickness(pages: number): number {
  const progress = (pages - PAGES.min) / (PAGES.max - PAGES.min);
  const eased =
    progress > 0.5 ? 1 - easeIntoLimit(1 - progress) : easeIntoLimit(progress);

  return Math.round(
    THICKNESS_PX.min + eased * (THICKNESS_PX.max - THICKNESS_PX.min)
  );
}

// A parabola matching the linear slope at the knee flattens out exactly at
// the limit, `2 × KNEE` past it.
function easeIntoLimit(progress: number) {
  if (progress >= KNEE) return progress;
  const overshoot = Math.min(KNEE - progress, 2 * KNEE);
  return KNEE - overshoot + overshoot ** 2 / (4 * KNEE);
}

interface BookLike {
  authors: string;
  finishedAt?: string | undefined;
  pages?: number | undefined;
  startedAt?: string | undefined;
}

/** Finished books per year, from the first year until `nowMs`. */
export function getBooksPerYear(
  books: BookLike[],
  nowMs: number
): { count: number; year: number }[] {
  const counts = new Map<number, number>();
  for (const book of books) {
    const time = Date.parse(book.finishedAt ?? book.startedAt ?? "");
    if (Number.isNaN(time)) continue;
    const year = new Date(time).getUTCFullYear();
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const first = Math.min(...counts.keys());
  const last = new Date(nowMs).getUTCFullYear();
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    count: counts.get(first + index) ?? 0,
    year: first + index,
  }));
}

/** The year I finished a book, or started it without an end date. */
export function getBookYear(book: BookLike): number | undefined {
  const time = Date.parse(book.finishedAt ?? book.startedAt ?? "");
  return Number.isNaN(time) ? undefined : new Date(time).getUTCFullYear();
}

/** Authors by how many of their books I read, most first. */
export function getAuthors(
  books: BookLike[]
): { count: number; name: string }[] {
  const counts = new Map<string, number>();
  for (const book of books) {
    const name = book.authors?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ count, name }));
}

/** Pages read, counting only books with a known page count. */
export function getPagesRead(books: BookLike[]): number {
  return books.reduce((sum, book) => sum + (book.pages ?? 0), 0);
}
