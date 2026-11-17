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
