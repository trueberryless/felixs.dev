import { type Bodies, DEPTH, POINTER_REACH, isOccluded } from "./bodies";

export const STAR_COLORS = [
  [255, 255, 255],
  [236, 228, 255],
  [206, 222, 255],
  [255, 218, 242],
  [190, 242, 255],
] as const;
/** Stars at least this near are drawn large, with a glow. */
export const BRIGHT_NEARNESS = 0.8;

const STAR_AREA = 4200;
const MIN_STARS = 90;
const MAX_STARS = 420;
const BAND_SHARE = 0.35;
const SHOOTING_STAR_GAP = [5, 13] as const;
// Clicks this close together share a direction, so spam-clicking fires
// parallel arrows instead of stars crossing each other.
const AIM_LOCK_S = 1.5;
const LINK_RADIUS = 150;
const MAX_LINKED_STARS = 9;
const LINKS_PER_STAR = 2;

export function createStars(width: number, height: number): Star[] {
  const count = Math.round(
    Math.min(MAX_STARS, Math.max(MIN_STARS, (width * height) / STAR_AREA))
  );
  const aspect = width / Math.max(height, 1);

  return Array.from({ length: count }, (): Star => {
    // Most stars are far away. Nearness drives everything else: closer stars
    // are larger, brighter and move further, exactly like the rest of the sky.
    const nearness = Math.random() ** 2.2;
    const x = Math.random();
    // A share of the stars gathers along the same diagonal as the nebula.
    const y =
      Math.random() < BAND_SHARE
        ? 0.34 + 0.55 * aspect * (x - 0.5) + gaussian() * 0.08
        : Math.random();

    return {
      color: Math.floor(Math.random() * STAR_COLORS.length),
      depth: DEPTH.starsFar + nearness * (DEPTH.starsNear - DEPTH.starsFar),
      hasSpikes: nearness >= BRIGHT_NEARNESS && Math.random() < 0.35,
      nearness,
      phase: random(0, Math.PI * 2),
      twinkleSpeed: random(0.6, 2.4),
      x,
      y: wrap(y, 1),
    };
  });
}

/**
 * Where a star is on screen, in CSS pixels. The starfield's vertex shader does
 * the same math on the GPU; this copy serves the effects drawn on top.
 */
function projectStar(
  star: Star,
  { height, scroll, view, warp, width }: ProjectionInput
) {
  const x = star.x * width - view.x * star.depth * POINTER_REACH;
  const y = wrap(
    star.y * height - scroll * star.depth - view.y * star.depth * POINTER_REACH,
    height
  );
  // While dropping out of warp the stars stream outwards into place.
  const travel = 0.25 + 0.75 * (1 - warp);

  return {
    x: width / 2 + (x - width / 2) * travel,
    y: height / 2 + (y - height / 2) * travel,
  };
}

/**
 * The sparse effects on top of the stars: constellation links near the
 * pointer, shooting stars and the warp tails. The canvas is only redrawn while
 * one of them is visible.
 */
export function createSkyEffects(
  canvas: HTMLCanvasElement
): SkyEffects | undefined {
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let shootingStars: ShootingStar[] = [];
  let nextShootingStar = 0;
  let aimAngle = 0;
  let lastShotAt = -Infinity;
  let isDirty = false;

  function resize(
    nextWidth: number,
    nextHeight: number,
    pixelRatio: number,
    nextStars: Star[]
  ) {
    width = nextWidth;
    height = nextHeight;
    stars = nextStars;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    isDirty = false;
  }

  function draw(frame: EffectsFrame) {
    const { animate, bodies, pointer, time, warp } = frame;
    if (animate && warp === 0) updateShootingStars(time);
    const showsLinks = pointer.strength > 0.01 && warp === 0;
    if (!showsLinks && warp === 0 && shootingStars.length === 0) {
      if (isDirty) context!.clearRect(0, 0, width, height);
      isDirty = false;
      return;
    }

    const ctx = context!;
    ctx.clearRect(0, 0, width, height);
    isDirty = true;
    const input = { ...frame, height, width };
    if (warp > 0) drawWarpTails(ctx, input);
    if (showsLinks) drawLinks(ctx, input, bodies, pointer);
    drawShootingStars(ctx, time, bodies);
    ctx.globalAlpha = 1;
  }

  function hasShootingStar() {
    return shootingStars.length > 0;
  }

  /** Fires one shooting star through a point, like an arrow. */
  function fireShot(x: number, y: number, time: number) {
    if (time - lastShotAt > AIM_LOCK_S) aimAngle = random(0, Math.PI * 2);
    lastShotAt = time;
    shootingStars.push(
      createShootingStar({
        angle: aimAngle,
        born: time,
        isNear: true,
        through: { x, y },
      })
    );
  }

  function drawWarpTails(
    ctx: CanvasRenderingContext2D,
    input: ProjectionInput
  ) {
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.lineCap = "round";
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = Math.min(1, 0.35 + input.warp * 0.6);
    // One path per color keeps this to a handful of draw calls.
    for (const [colorIndex, color] of STAR_COLORS.entries()) {
      ctx.strokeStyle = `rgb(${color.join(", ")})`;
      ctx.beginPath();
      for (const star of stars) {
        if (star.color !== colorIndex) continue;
        const { x, y } = projectStar(star, input);
        ctx.moveTo(x, y);
        ctx.lineTo(
          x - (x - centerX) * input.warp * 0.6,
          y - (y - centerY) * input.warp * 0.6
        );
      }
      ctx.stroke();
    }
  }

  // Stars near the pointer federate into a tiny constellation.
  function drawLinks(
    ctx: CanvasRenderingContext2D,
    input: ProjectionInput,
    bodies: Bodies,
    pointer: PointerState
  ) {
    const nearby: { distance: number; x: number; y: number }[] = [];
    for (const star of stars) {
      const { x, y } = projectStar(star, input);
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      if (distance < LINK_RADIUS && !isOccluded(bodies, x, y)) {
        nearby.push({ distance, x, y });
      }
    }
    nearby.sort((a, b) => a.distance - b.distance);
    const linked = nearby.slice(0, MAX_LINKED_STARS);
    const drawn = new Set<string>();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgb(214, 196, 255)";
    for (const [fromIndex, from] of linked.entries()) {
      const neighbours = linked
        .map((to, toIndex) => ({
          distance: Math.hypot(to.x - from.x, to.y - from.y),
          to,
          toIndex,
        }))
        .filter(({ toIndex }) => toIndex !== fromIndex)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, LINKS_PER_STAR);

      for (const { to, toIndex } of neighbours) {
        const key = [fromIndex, toIndex].sort((a, b) => a - b).join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);
        const closeness =
          1 - Math.max(from.distance, to.distance) / LINK_RADIUS;
        ctx.globalAlpha = pointer.strength * closeness * 0.55;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
  }

  function updateShootingStars(time: number) {
    if (nextShootingStar === 0) nextShootingStar = time + random(2, 5);
    if (time >= nextShootingStar) {
      // Ambient ones come from anywhere, aimed to cross the upper sky.
      shootingStars.push(
        createShootingStar({
          angle: random(0, Math.PI * 2),
          born: time,
          isNear: false,
          through: {
            x: random(0.15, 0.85) * width,
            y: random(0.1, 0.6) * height,
          },
        })
      );
      nextShootingStar = time + random(...SHOOTING_STAR_GAP);
    }
    shootingStars = shootingStars.filter(
      (star) => time - star.born < star.life
    );
  }

  function drawShootingStars(
    ctx: CanvasRenderingContext2D,
    time: number,
    bodies: Bodies
  ) {
    for (const star of shootingStars) {
      const age = time - star.born;
      if (age < 0) continue;
      const headX = star.x + star.vx * age;
      const headY = star.y + star.vy * age;
      // Ambient ones burn up far behind the planet; clicked ones fly in front.
      if (!star.isNear && isOccluded(bodies, headX, headY)) continue;

      const speed = Math.hypot(star.vx, star.vy);
      const tailX = headX - (star.vx / speed) * star.length;
      const tailY = headY - (star.vy / speed) * star.length;
      const gradient = ctx.createLinearGradient(headX, headY, tailX, tailY);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      gradient.addColorStop(0.3, "rgba(214, 190, 255, 0.45)");
      gradient.addColorStop(1, "rgba(160, 120, 255, 0)");

      ctx.globalAlpha = Math.sin((Math.PI * age) / star.life);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = star.isNear ? 2.2 : 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      // A glowing head makes clicked stars read as arrows of light.
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.shadowColor = "rgb(200, 170, 255)";
      ctx.shadowBlur = star.isNear ? 10 : 6;
      ctx.beginPath();
      ctx.arc(headX, headY, star.isNear ? 1.8 : 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  return { draw, fireShot, hasShootingStar, resize };
}

// Starts half a flight before the given point, so the star passes through it.
function createShootingStar({
  angle,
  born,
  isNear,
  through,
}: ShootingStarInput): ShootingStar {
  const speed = isNear ? random(1100, 1400) : random(700, 1100);
  const life = random(0.7, 1.1);
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  return {
    born,
    isNear,
    length: isNear ? random(150, 200) : random(120, 220),
    life,
    vx,
    vy,
    x: through.x - vx * life * 0.5,
    y: through.y - vy * life * 0.5,
  };
}

function wrap(value: number, size: number) {
  return ((value % size) + size) % size;
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function gaussian() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

export interface Star {
  color: number;
  depth: number;
  hasSpikes: boolean;
  /** 0 for the farthest stars, 1 for the nearest. */
  nearness: number;
  phase: number;
  twinkleSpeed: number;
  x: number;
  y: number;
}

export interface SkyEffects {
  draw: (frame: EffectsFrame) => void;
  fireShot: (x: number, y: number, time: number) => void;
  hasShootingStar: () => boolean;
  resize: (
    width: number,
    height: number,
    pixelRatio: number,
    stars: Star[]
  ) => void;
}

interface ProjectionInput {
  height: number;
  scroll: number;
  /** The smoothed pointer position, from -0.5 to 0.5, that shifts the view. */
  view: { x: number; y: number };
  warp: number;
  width: number;
}

interface PointerState {
  strength: number;
  x: number;
  y: number;
}

interface EffectsFrame {
  animate: boolean;
  bodies: Bodies;
  /** Where the pointer is, in CSS pixels, and how visible its links are. */
  pointer: PointerState;
  scroll: number;
  time: number;
  view: { x: number; y: number };
  warp: number;
}

interface ShootingStarInput {
  angle: number;
  born: number;
  isNear: boolean;
  through: { x: number; y: number };
}

interface ShootingStar {
  born: number;
  isNear: boolean;
  length: number;
  life: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}
