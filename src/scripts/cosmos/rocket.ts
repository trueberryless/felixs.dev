const IGNITION_MS = 650;
const ASCENT_MS = 1400;
const ROCKET_WIDTH = 34;
const ROCKET_HEIGHT = 60;
const ROCKET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 72">
  <defs>
    <linearGradient id="hull" x1="0" x2="1">
      <stop offset="0" stop-color="#fff"/>
      <stop offset="1" stop-color="#cbbcff"/>
    </linearGradient>
  </defs>
  <path d="M10 38 2 58l9-4z M30 38l8 20-9-4z" fill="#d946ef"/>
  <path d="M20 2c10 10 12 28 10 50H10C8 30 10 12 20 2z" fill="url(#hull)"/>
  <path d="M20 2c4 4 6.5 9 7.6 14H12.4C13.5 11 16 6 20 2z" fill="#a78bfa"/>
  <circle cx="20" cy="27" r="5.5" fill="#67e8f9" stroke="#7c3aed" stroke-width="2.4"/>
  <rect x="13" y="51" width="14" height="6" rx="2" fill="#6d4bd8"/>
  <path d="M20 40v12" stroke="#a78bfa" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

/**
 * Launches a little rocket from the given element. The returned promise
 * resolves once the rocket is about to leave the viewport, which is the cue to
 * reveal the celestial theme behind it.
 */
export function launchRocket(from: Element | null): Promise<LaunchExit> {
  const canvas = document.createElement("canvas");
  canvas.className = "cosmos-launch";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  document.body.append(canvas);

  const rect = from?.getBoundingClientRect();
  const padX = rect ? rect.left + rect.width / 2 : width / 2;
  const padY = rect ? rect.top - 6 : height - 64;
  const rocket = new Image();
  rocket.src = `data:image/svg+xml,${encodeURIComponent(ROCKET_SVG)}`;

  return new Promise((resolve) => {
    if (!context) {
      canvas.remove();
      resolve({ x: padX, y: 0 });
      return;
    }

    let particles: Particle[] = [];
    let startedAt = 0;
    let hasExited = false;

    function tick(now: number) {
      startedAt ||= now;
      const elapsed = now - startedAt;
      const ignition = Math.min(1, elapsed / IGNITION_MS);
      const ascent = Math.max(
        0,
        Math.min(1, (elapsed - IGNITION_MS) / ASCENT_MS)
      );
      const lift = ascent ** 3;
      const shake = ascent < 0.2 ? (Math.random() - 0.5) * 2.4 * ignition : 0;
      const x = padX + Math.sin(ascent * Math.PI * 1.3) * 12 + shake;
      const y = padY - (padY + ROCKET_HEIGHT * 2) * lift;
      const isFlying = ascent < 1;

      if (isFlying) {
        particles.push(...createExhaust(x, y, ignition, ascent));
      }
      particles = particles.filter((particle) => particle.age < particle.life);

      context!.clearRect(0, 0, width, height);
      for (const particle of particles) {
        drawParticle(context!, particle);
      }
      if (isFlying) {
        drawFlame(context!, x, y, ignition, ascent);
        context!.globalAlpha = 1;
        context!.drawImage(
          rocket,
          x - ROCKET_WIDTH / 2,
          y - ROCKET_HEIGHT,
          ROCKET_WIDTH,
          ROCKET_HEIGHT
        );
      }

      if (!hasExited && ascent > 0 && y < height * 0.18) {
        hasExited = true;
        resolve({ x, y: Math.max(y, 0) });
      }

      if (isFlying || particles.length > 0) {
        requestAnimationFrame(tick);
        return;
      }
      canvas.remove();
      if (!hasExited) resolve({ x, y: 0 });
    }

    rocket
      .decode()
      .catch(() => undefined)
      .then(() => requestAnimationFrame(tick));
  });
}

function createExhaust(
  x: number,
  y: number,
  ignition: number,
  ascent: number
): Particle[] {
  const isOnPad = ascent === 0;
  const count = isOnPad ? Math.ceil(ignition * 3) : 4;

  return Array.from({ length: count }, () => {
    const isHot = Math.random() < 0.45;
    const spread = isOnPad ? 160 : 40;

    return {
      age: 0,
      hue: isHot ? 30 + Math.random() * 30 : 270 + Math.random() * 40,
      isHot,
      life: isHot ? 0.35 + Math.random() * 0.3 : 0.8 + Math.random() * 0.7,
      radius: isHot ? 2 + Math.random() * 3 : 4 + Math.random() * 5,
      vx: (Math.random() - 0.5) * spread,
      vy: isOnPad ? 10 + Math.random() * 40 : 120 + Math.random() * 160,
      x: x + (Math.random() - 0.5) * 8,
      y,
    };
  });
}

function drawParticle(context: CanvasRenderingContext2D, particle: Particle) {
  const step = 1 / 60;
  particle.age += step;
  particle.x += particle.vx * step;
  particle.y += particle.vy * step;
  particle.vx *= 0.97;
  particle.vy *= 0.95;
  const progress = particle.age / particle.life;
  const radius =
    particle.radius * (1 + progress * (particle.isHot ? 0.5 : 2.6));

  context.globalCompositeOperation = particle.isHot ? "lighter" : "source-over";
  context.globalAlpha = (1 - progress) * (particle.isHot ? 0.9 : 0.35);
  context.fillStyle = particle.isHot
    ? `hsl(${particle.hue} 100% ${70 - progress * 20}%)`
    : `hsl(${particle.hue} 45% 82%)`;
  context.beginPath();
  context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
}

function drawFlame(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  ignition: number,
  ascent: number
) {
  const length =
    (14 + ignition * 14 + ascent * 26) * (0.85 + Math.random() * 0.3);
  const gradient = context.createLinearGradient(x, y, x, y + length);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.3, "rgba(255, 214, 120, 0.9)");
  gradient.addColorStop(0.7, "rgba(244, 114, 182, 0.55)");
  gradient.addColorStop(1, "rgba(168, 85, 247, 0)");

  context.globalAlpha = 1;
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(x - 6, y - 4);
  context.quadraticCurveTo(x, y + length * 1.1, x + 6, y - 4);
  context.closePath();
  context.fill();
  context.globalCompositeOperation = "source-over";
}

export interface LaunchExit {
  x: number;
  y: number;
}

interface Particle {
  age: number;
  hue: number;
  isHot: boolean;
  life: number;
  radius: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}
