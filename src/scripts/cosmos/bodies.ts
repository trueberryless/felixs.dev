// Parallax for the whole sky: depth `d` (0 is infinitely far, 1 is the page)
// moves `d` times the scroll and `d × POINTER_REACH` with the pointer. Closer
// things are in front, so the planet hides the stars behind it.
export const DEPTH = {
  nebula: 0.004,
  planet: 0.062,
  starsFar: 0.002,
  starsNear: 0.016,
} as const;

export const POINTER_REACH = 420;

/**
 * How far the planet rises by the end of a page, as a share of the viewport.
 * Long pages slow the rise evenly, so it moves until the end.
 */
const FULL_PLANET_RISE = 0.9;

/** The planet's position in CSS pixels, for the nebula and starfield. */
export function getBodies({
  arrival,
  height,
  pointer,
  scroll,
  scrollMax,
  time,
  width,
}: BodiesInput): Bodies {
  const rate = Math.min(
    DEPTH.planet,
    (height * FULL_PLANET_RISE) / Math.max(scrollMax, 1)
  );
  const planetRise = Math.min(scroll, scrollMax) * rate;

  return {
    planet: {
      radius: height,
      x:
        width * 0.68 +
        Math.sin(time * 0.031) * height * 0.012 -
        pointer.x * DEPTH.planet * POINTER_REACH,
      // Rises into place while arriving from warp speed.
      y:
        height * 1.83 +
        Math.sin(time * 0.047) * height * 0.008 +
        arrival * height * 0.45 -
        planetRise -
        pointer.y * DEPTH.planet * POINTER_REACH,
    },
  };
}

/** Whether a point is hidden behind the planet. */
export function isOccluded({ planet }: Bodies, x: number, y: number) {
  return (x - planet.x) ** 2 + (y - planet.y) ** 2 < planet.radius ** 2;
}

export interface Bodies {
  planet: Body;
}

interface Body {
  radius: number;
  x: number;
  y: number;
}

interface BodiesInput {
  arrival: number;
  height: number;
  /** The smoothed pointer position, from -0.5 to 0.5 on each axis. */
  pointer: { x: number; y: number };
  scroll: number;
  /** How far the page can scroll at all. */
  scrollMax: number;
  time: number;
  width: number;
}
