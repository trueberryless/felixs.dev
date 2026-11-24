export interface Point {
  x: number;
  y: number;
}

export interface Seed extends Point {
  /** How far the point itself reaches out, which it always keeps inside. */
  reach?: number;
}

export interface Rect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface Obstacle {
  rect: Rect;
  /** How far points keep from it, as a share of their spacing. */
  share: number;
}

interface SpreadOptions {
  iterations?: number;
  /** How far points keep from the edges, as a share of their spacing. */
  wallShare?: number;
}

/**
 * Spreads points out evenly in a box around some obstacles, like particles
 * that push each other away. Every pair closer than the spacing pushes
 * apart, and so do the edges and the obstacles. The spacing comes from the
 * free area, so the points settle into a loose triangular pattern that fills
 * it. The same seeds always give the same layout.
 */
export function spreadOut(
  seeds: Seed[],
  box: Rect,
  obstacles: Obstacle[],
  { iterations = 400, wallShare = 0.4 }: SpreadOptions = {}
): Point[] {
  if (seeds.length === 0) return [];
  const spacing = getSpacing(seeds.length, box, obstacles, wallShare);
  const points = seeds.map((seed) => clampTo(box, seed));

  for (let step = 0; step < iterations; step++) {
    // Big moves first, then ever smaller ones, so the points settle.
    const rate = 0.5 * (1 - step / iterations) + 0.02;
    const forces = points.map(() => ({ x: 0, y: 0 }));

    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        const pointA = points[a]!;
        const pointB = points[b]!;
        let dx = pointA.x - pointB.x;
        let dy = pointA.y - pointB.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= spacing) continue;
        if (distance < 0.001) {
          // Points on the same spot part along a fixed direction.
          dx = Math.cos(a + b);
          dy = Math.sin(a + b);
          distance = 1;
        }
        const push = (spacing - distance) / 2 / distance;
        forces[a]!.x += dx * push;
        forces[a]!.y += dy * push;
        forces[b]!.x -= dx * push;
        forces[b]!.y -= dy * push;
      }
    }

    // Edges and obstacles push harder than the points push each other, so
    // a crowd never squeezes a point into them.
    for (const [index, point] of points.entries()) {
      const force = forces[index]!;
      const wall = Math.max(spacing * wallShare, seeds[index]!.reach ?? 0);
      force.x += STIFFNESS * Math.max(0, box.left + wall - point.x);
      force.x -= STIFFNESS * Math.max(0, point.x - (box.right - wall));
      force.y += STIFFNESS * Math.max(0, box.top + wall - point.y);
      force.y -= STIFFNESS * Math.max(0, point.y - (box.bottom - wall));
      for (const { rect, share } of obstacles) {
        const away = awayFrom(rect, point, spacing * share, box);
        force.x += STIFFNESS * away.x;
        force.y += STIFFNESS * away.y;
      }
    }

    for (const [index, point] of points.entries()) {
      const moved = clampTo(box, {
        x: point.x + forces[index]!.x * rate,
        y: point.y + forces[index]!.y * rate,
      });
      point.x = moved.x;
      point.y = moved.y;
    }
  }

  return points;
}

const STIFFNESS = 3;

/**
 * The distance between neighbours when the points fill the free area: the
 * box minus its edges and the obstacles with their clearance. Those depend
 * on the spacing in turn, so it settles over a few rounds.
 */
export function getSpacing(
  count: number,
  box: Rect,
  obstacles: Obstacle[],
  wallShare = 0.4
) {
  let spacing = Math.sqrt(areaOf(box) / Math.max(count, 1));
  for (let round = 0; round < 6; round++) {
    const inner = grow(box, -spacing * wallShare);
    const blocked = obstacles.reduce(
      (sum, { rect, share }) =>
        sum + areaOf(intersect(grow(rect, spacing * share), inner)),
      0
    );
    const free = Math.max(areaOf(inner) - blocked, 1);
    // Each point of a triangular grid takes up √3/2 × spacing², and the
    // points on the rim of the free area take up only part of that.
    spacing =
      Math.sqrt((2 * free) / (Math.sqrt(3) * Math.max(count, 1))) * 1.15;
  }
  return spacing;
}

function grow(rect: Rect, by: number): Rect {
  return {
    bottom: rect.bottom + by,
    left: rect.left - by,
    right: rect.right + by,
    top: rect.top - by,
  };
}

/** How far to push a point so it keeps its distance from a rectangle. */
function awayFrom(
  rect: Rect,
  point: Point,
  clearance: number,
  box: Rect
): Point {
  const nearestX = Math.min(Math.max(point.x, rect.left), rect.right);
  const nearestY = Math.min(Math.max(point.y, rect.top), rect.bottom);
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    // Inside: out through the nearest side that leads back into the box,
    // so a rectangle at an edge never traps a point against it.
    const exits = [
      { x: rect.left - point.x - clearance, y: 0 },
      { x: rect.right - point.x + clearance, y: 0 },
      { x: 0, y: rect.top - point.y - clearance },
      { x: 0, y: rect.bottom - point.y + clearance },
    ].filter((exit) => {
      const x = point.x + exit.x;
      const y = point.y + exit.y;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
    if (exits.length === 0) return { x: 0, y: 0 };
    return exits.reduce((best, exit) =>
      Math.hypot(exit.x, exit.y) < Math.hypot(best.x, best.y) ? exit : best
    );
  }
  if (distance >= clearance) return { x: 0, y: 0 };
  const push = (clearance - distance) / distance;
  return { x: dx * push, y: dy * push };
}

function clampTo(box: Rect, point: Point): Point {
  return {
    x: Math.min(Math.max(point.x, box.left), box.right),
    y: Math.min(Math.max(point.y, box.top), box.bottom),
  };
}

function intersect(a: Rect, b: Rect): Rect {
  return {
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
  };
}

function areaOf(rect: Rect) {
  return (
    Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top)
  );
}
