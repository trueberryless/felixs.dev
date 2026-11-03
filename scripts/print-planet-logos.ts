// Wraps the hero's logos around a sphere and prints them in one color, for
// the planets of the space theme. The prints are committed, so this only runs
// when a logo changes: `node scripts/print-planet-logos.ts`.
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE_SIZE = 512;
const PRINT_SIZE = 256;
// How far around the planet a logo reaches from its centre, in radians.
const SPAN = 1.05;
// The logo's share of its square, leaving a margin of bare surface.
const LOGO_SHARE = 0.62;
const LOGO_SIZE = Math.round((SOURCE_SIZE * LOGO_SHARE) / 2) * 2;
const LOGO_MARGIN = (SOURCE_SIZE - LOGO_SIZE) / 2;
const TRANSPARENT = { alpha: 0, b: 0, g: 0, r: 0 };
const LOGOS: LogoPrint[] = [
  // Astro's mark is a shape on its own, its flame included.
  { mode: "alpha", name: "astro", pitch: 0.12, yaw: -0.16 },
  // The cat is the dark part of the badge.
  { mode: "dark", name: "catppuccin", pitch: 0.1, yaw: 0.14 },
  // The letter and its bar stand out from the tile's navy.
  { crop: 0.2, mode: "bright", name: "emdash-cms", pitch: -0.1, yaw: -0.14 },
  { mode: "alpha", name: "npmx", pitch: 0.08, yaw: 0.16 },
  { mode: "alpha", name: "starlight", pitch: -0.12, yaw: -0.12 },
];

const logosDir = new URL("../src/assets/logos/", import.meta.url);

for (const logo of LOGOS) {
  const ink = await readInk(logo);
  const print = wrapAroundSphere(ink, logo);
  const output = fileURLToPath(new URL(`planets/${logo.name}.png`, logosDir));
  await sharp(print, {
    raw: { channels: 4, height: PRINT_SIZE, width: PRINT_SIZE },
  })
    .png({ compressionLevel: 9 })
    .toFile(output);
}

/** Reads a logo into a square map of how much ink every pixel holds. */
async function readInk({ crop = 0, mode, name }: LogoPrint) {
  const input = fileURLToPath(new URL(`light/${name}.png`, logosDir));
  const image = sharp(input).ensureAlpha();
  const { height = 0, width = 0 } = await image.metadata();
  const inset = Math.round(Math.min(width, height) * crop);
  const { data } = await image
    .extract({
      height: height - inset * 2,
      left: inset,
      top: inset,
      width: width - inset * 2,
    })
    .resize(LOGO_SIZE, LOGO_SIZE, {
      background: TRANSPARENT,
      fit: "contain",
    })
    .extend({
      background: TRANSPARENT,
      bottom: LOGO_MARGIN,
      left: LOGO_MARGIN,
      right: LOGO_MARGIN,
      top: LOGO_MARGIN,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ink = new Float32Array(SOURCE_SIZE * SOURCE_SIZE);
  for (let index = 0; index < ink.length; index++) {
    const [r, g, b, a] = [0, 1, 2, 3].map(
      (channel) => (data[index * 4 + channel] ?? 0) / 255
    ) as [number, number, number, number];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const brightest = Math.max(r, g, b);
    ink[index] =
      mode === "alpha"
        ? a
        : mode === "dark"
          ? a * clamp((0.32 - luminance) / 0.12)
          : a * clamp((brightest - 0.5) / 0.16);
  }

  return ink;
}

/**
 * Looks at a sphere from the front and paints every visible point with the
 * ink at its longitude and latitude, so the logo curves with the surface and
 * squeezes towards the edge. Yaw and pitch turn its centre away a little.
 */
function wrapAroundSphere(ink: Float32Array, { pitch, yaw }: LogoPrint) {
  const print = Buffer.alloc(PRINT_SIZE * PRINT_SIZE * 4);
  for (let py = 0; py < PRINT_SIZE; py++) {
    for (let px = 0; px < PRINT_SIZE; px++) {
      const x = ((px + 0.5) / PRINT_SIZE) * 2 - 1;
      const y = ((py + 0.5) / PRINT_SIZE) * 2 - 1;
      const distance = Math.hypot(x, y);
      if (distance >= 1) continue;
      const z = Math.sqrt(1 - distance ** 2);

      // Turns the visible point onto the sphere's own axes.
      const turnedX = x * Math.cos(yaw) - z * Math.sin(yaw);
      const turnedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
      const tiltedY = y * Math.cos(pitch) - turnedZ * Math.sin(pitch);
      const tiltedZ = y * Math.sin(pitch) + turnedZ * Math.cos(pitch);
      const longitude = Math.atan2(turnedX, tiltedZ);
      const latitude = Math.asin(clamp(tiltedY, -1, 1));
      const u = 0.5 + longitude / (2 * SPAN);
      const v = 0.5 + latitude / (2 * SPAN);

      // Smooths the planet's rim, which would otherwise be jagged.
      const rim = clamp((1 - distance) * PRINT_SIZE * 0.5);
      const alpha = sampleInk(ink, u, v) * rim;
      const offset = (py * PRINT_SIZE + px) * 4;
      print.fill(255, offset, offset + 3);
      print[offset + 3] = Math.round(alpha * 255);
    }
  }

  return print;
}

// Bilinear, so the curved print stays smooth.
function sampleInk(ink: Float32Array, u: number, v: number) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const x = u * (SOURCE_SIZE - 1);
  const y = v * (SOURCE_SIZE - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(left + 1, SOURCE_SIZE - 1);
  const bottom = Math.min(top + 1, SOURCE_SIZE - 1);
  const at = (column: number, row: number) =>
    ink[row * SOURCE_SIZE + column] ?? 0;
  const upper = at(left, top) + (at(right, top) - at(left, top)) * (x - left);
  const lower =
    at(left, bottom) + (at(right, bottom) - at(left, bottom)) * (x - left);

  return upper + (lower - upper) * (y - top);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

interface LogoPrint {
  /** The share cut from every side first, to drop a tile's frame. */
  crop?: number;
  /** Which pixels count as ink. */
  mode: "alpha" | "bright" | "dark";
  name: string;
  pitch: number;
  yaw: number;
}
