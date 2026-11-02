const STAR_COLORS = [
  "255, 255, 255",
  "236, 228, 255",
  "206, 222, 255",
  "255, 218, 242",
  "190, 242, 255",
];
const STAR_AREA = 4200;
const MIN_STARS = 90;
const MAX_STARS = 420;
const BAND_SHARE = 0.35;
const SHOOTING_STAR_GAP = [5, 13] as const;
const LINK_RADIUS = 150;
const MAX_LINKED_STARS = 9;
const LINKS_PER_STAR = 2;

export function createStarfield(
  canvas: HTMLCanvasElement
): Starfield | undefined {
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  const sprites = STAR_COLORS.map(createGlowSprite);
  let width = 0;
  let height = 0;
  let stars: Star[] = [];
  let positions = new Float32Array(0);
  let shootingStars: ShootingStar[] = [];
  let nextShootingStar = 0;

  function resize(nextWidth: number, nextHeight: number, pixelRatio: number) {
    width = nextWidth;
    height = nextHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    stars = createStars(width, height);
    positions = new Float32Array(stars.length * 2);
  }

  function draw(frame: StarfieldFrame) {
    const { animate, parallax, pointer, scroll, time, warp } = frame;
    const ctx = context!;
    const centerX = width / 2;
    const centerY = height / 2;
    // While dropping out of warp the stars stream outwards into place.
    const travel = 0.25 + 0.75 * (1 - warp);

    ctx.clearRect(0, 0, width, height);

    for (const [index, star] of stars.entries()) {
      let x = star.x * width + parallax.x * star.depth * 14;
      let y = wrap(
        star.y * height -
          scroll * star.depth * 0.06 +
          parallax.y * star.depth * 10,
        height
      );
      const twinkle = animate
        ? 0.6 + 0.4 * Math.sin(time * star.twinkleSpeed + star.phase)
        : 0.85;
      const alpha = star.brightness * twinkle;
      const color = STAR_COLORS[star.color] ?? STAR_COLORS[0];

      if (warp > 0) {
        const dx = (x - centerX) * travel;
        const dy = (y - centerY) * travel;
        x = centerX + dx;
        y = centerY + dy;
        ctx.globalAlpha = Math.min(1, alpha + warp * 0.6);
        ctx.strokeStyle = `rgb(${color})`;
        ctx.lineWidth = star.radius * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * warp * 0.6, y - dy * warp * 0.6);
        ctx.stroke();
      }

      positions[index * 2] = x;
      positions[index * 2 + 1] = y;
      ctx.globalAlpha = alpha;

      if (star.radius > 1.3) {
        const size = star.radius * 7;
        const sprite = sprites[star.color] ?? sprites[0]!;
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
        if (star.hasSpikes) {
          const length = star.radius * 9;
          ctx.globalAlpha = alpha * 0.35;
          ctx.fillStyle = `rgb(${color})`;
          ctx.fillRect(x - length, y - 0.35, length * 2, 0.7);
          ctx.fillRect(x - 0.35, y - length, 0.7, length * 2);
        }
      } else {
        ctx.fillStyle = `rgb(${color})`;
        ctx.fillRect(
          x - star.radius,
          y - star.radius,
          star.radius * 2,
          star.radius * 2
        );
      }
    }

    if (pointer.strength > 0.01 && warp === 0) drawLinks(ctx, pointer);
    if (animate && warp === 0) drawShootingStars(ctx, time);
    ctx.globalAlpha = 1;
  }

  // Stars near the pointer federate into a tiny constellation.
  function drawLinks(ctx: CanvasRenderingContext2D, pointer: PointerState) {
    const nearby: { distance: number; index: number }[] = [];
    for (let index = 0; index < stars.length; index++) {
      const distance = Math.hypot(
        (positions[index * 2] ?? 0) - pointer.x,
        (positions[index * 2 + 1] ?? 0) - pointer.y
      );
      if (distance < LINK_RADIUS) nearby.push({ distance, index });
    }
    nearby.sort((a, b) => a.distance - b.distance);
    const linked = nearby.slice(0, MAX_LINKED_STARS);
    const drawn = new Set<string>();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgb(214, 196, 255)";
    for (const from of linked) {
      const neighbours = linked
        .filter((to) => to.index !== from.index)
        .map((to) => ({
          distance: getDistance(positions, from.index, to.index),
          to,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, LINKS_PER_STAR);

      for (const { to } of neighbours) {
        const key = [from.index, to.index].sort((a, b) => a - b).join("-");
        if (drawn.has(key)) continue;
        drawn.add(key);
        const closeness =
          1 - Math.max(from.distance, to.distance) / LINK_RADIUS;
        ctx.globalAlpha = pointer.strength * closeness * 0.55;
        ctx.beginPath();
        ctx.moveTo(positions[from.index * 2]!, positions[from.index * 2 + 1]!);
        ctx.lineTo(positions[to.index * 2]!, positions[to.index * 2 + 1]!);
        ctx.stroke();
      }
    }
  }

  function drawShootingStars(ctx: CanvasRenderingContext2D, time: number) {
    if (nextShootingStar === 0) nextShootingStar = time + random(2, 5);
    if (time >= nextShootingStar) {
      shootingStars.push(createShootingStar(width, height, time));
      nextShootingStar = time + random(...SHOOTING_STAR_GAP);
    }

    shootingStars = shootingStars.filter(
      (star) => time - star.born < star.life
    );
    for (const star of shootingStars) {
      const age = time - star.born;
      const progress = age / star.life;
      const headX = star.x + star.vx * age;
      const headY = star.y + star.vy * age;
      const speed = Math.hypot(star.vx, star.vy);
      const tailX = headX - (star.vx / speed) * star.length;
      const tailY = headY - (star.vy / speed) * star.length;
      const gradient = ctx.createLinearGradient(headX, headY, tailX, tailY);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      gradient.addColorStop(0.3, "rgba(214, 190, 255, 0.45)");
      gradient.addColorStop(1, "rgba(160, 120, 255, 0)");

      ctx.globalAlpha = Math.sin(Math.PI * progress);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(headX, headY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.drawImage(sprites[0]!, headX - 6, headY - 6, 12, 12);
    }
  }

  return { draw, resize };
}

function createStars(width: number, height: number) {
  const count = Math.round(
    Math.min(MAX_STARS, Math.max(MIN_STARS, (width * height) / STAR_AREA))
  );
  const aspect = width / Math.max(height, 1);

  return Array.from({ length: count }, (): Star => {
    const isBright = Math.random() < 0.07;
    const x = Math.random();
    // A share of the stars gathers along the same diagonal as the nebula.
    const y =
      Math.random() < BAND_SHARE
        ? 0.34 + 0.55 * aspect * (x - 0.5) + gaussian() * 0.08
        : Math.random();

    return {
      brightness: isBright ? random(0.75, 1) : random(0.35, 0.85),
      color: Math.floor(Math.random() * STAR_COLORS.length),
      depth: random(0.2, 1),
      hasSpikes: isBright && Math.random() < 0.25,
      phase: random(0, Math.PI * 2),
      radius: isBright ? random(1.4, 2.3) : random(0.35, 1.05),
      twinkleSpeed: random(0.6, 2.4),
      x,
      y: wrap(y, 1),
    };
  });
}

function createShootingStar(
  width: number,
  height: number,
  time: number
): ShootingStar {
  const angle = random(2.35, 2.75);
  const speed = random(700, 1100);

  return {
    born: time,
    length: random(120, 220),
    life: random(0.7, 1.1),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    x: random(0.25, 1.05) * width,
    y: random(-0.05, 0.35) * height,
  };
}

function createGlowSprite(color: string) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, `rgba(${color}, 1)`);
  gradient.addColorStop(0.12, `rgba(${color}, 0.85)`);
  gradient.addColorStop(0.3, `rgba(${color}, 0.25)`);
  gradient.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  return sprite;
}

function getDistance(positions: Float32Array, a: number, b: number) {
  return Math.hypot(
    (positions[a * 2] ?? 0) - (positions[b * 2] ?? 0),
    (positions[a * 2 + 1] ?? 0) - (positions[b * 2 + 1] ?? 0)
  );
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

interface PointerState {
  strength: number;
  x: number;
  y: number;
}

export interface Starfield {
  draw: (frame: StarfieldFrame) => void;
  resize: (width: number, height: number, pixelRatio: number) => void;
}

interface StarfieldFrame {
  animate: boolean;
  parallax: { x: number; y: number };
  pointer: PointerState;
  scroll: number;
  time: number;
  warp: number;
}

interface Star {
  brightness: number;
  color: number;
  depth: number;
  hasSpikes: boolean;
  phase: number;
  radius: number;
  twinkleSpeed: number;
  x: number;
  y: number;
}

interface ShootingStar {
  born: number;
  length: number;
  life: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}
