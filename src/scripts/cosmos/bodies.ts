// One parallax rule for the whole sky: something at depth `d` (0 is infinitely
// far, 1 is the page itself) moves `d` times as far as the page when
// scrolling, and `d × POINTER_REACH` when the pointer moves. Being closer also
// means being in front: the planet and the moon hide the stars behind them.
export const DEPTH = {
  moon: 0.022,
  nebula: 0.004,
  planet: 0.03,
  starsFar: 0.002,
  starsNear: 0.016,
} as const;

export const POINTER_REACH = 420;

/** The furthest the planet rises on long pages, as a share of the viewport. */
const MAX_PLANET_RISE = 0.22;

/**
 * Positions the planet and the moon in CSS pixels. The nebula shader paints
 * them from these numbers and the starfield uses them to hide occluded stars.
 */
export function getBodies({
  arrival,
  height,
  pointer,
  scroll,
  time,
  width,
}: BodiesInput): Bodies {
  const planetRise = Math.min(scroll * DEPTH.planet, height * MAX_PLANET_RISE);

  return {
    moon: {
      radius: height * 0.032,
      x:
        width * 0.2 +
        Math.cos(time * 0.021) * width * 0.04 -
        pointer.x * DEPTH.moon * POINTER_REACH,
      y:
        height * 0.22 +
        Math.sin(time * 0.021) * height * 0.015 -
        scroll * DEPTH.moon -
        pointer.y * DEPTH.moon * POINTER_REACH,
    },
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

/** Whether a point is hidden behind the planet or the moon. */
export function isOccluded({ moon, planet }: Bodies, x: number, y: number) {
  return (
    (x - planet.x) ** 2 + (y - planet.y) ** 2 < planet.radius ** 2 ||
    (x - moon.x) ** 2 + (y - moon.y) ** 2 < moon.radius ** 2
  );
}

export interface Bodies {
  moon: Body;
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
  time: number;
  width: number;
}
