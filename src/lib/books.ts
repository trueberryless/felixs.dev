// Page counts between these bounds map linearly onto the spine thickness, so
// a book twice as long really looks twice as thick. The bounds are fixed
// rather than taken from the shelf itself: one unusually long book then only
// tops out at the maximum instead of squeezing all others together.
const PAGES = { max: 900, min: 150 } as const;
const THICKNESS_PX = { max: 58, min: 14 } as const;
// The share of the range at either end where the scale eases into its limit
// instead of hitting it, so outliers still differ a little.
const KNEE = 0.15;

/**
 * Turns a page count into the book's thickness in pixels. Linear for typical
 * books, then quadratically easing into the minimum and maximum, which very
 * short or very long books share.
 */
export function getBookThickness(pages: number): number {
  const progress = (pages - PAGES.min) / (PAGES.max - PAGES.min);
  const eased =
    progress > 0.5 ? 1 - easeIntoLimit(1 - progress) : easeIntoLimit(progress);

  return Math.round(
    THICKNESS_PX.min + eased * (THICKNESS_PX.max - THICKNESS_PX.min)
  );
}

// Below the knee, a parabola with the linear part's slope where they meet
// flattens out exactly at the limit, `2 × KNEE` past it.
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
