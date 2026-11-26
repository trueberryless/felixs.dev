import { hierarchy, pack } from "d3-hierarchy";

import type { Bubble } from "./stories";

const MIN_FONT = 9;
const MAX_FONT = 15;

export interface PackedBubble extends Bubble {
  index: number;
  label: string;
  lines: string[] | undefined;
  r: number;
  size: number;
  x: number;
  y: number;
}

/**
 * Packs bubbles into a box, biggest first, and fits a label into each. `sqrt`
 * keeps huge values from shrinking the rest to dots.
 */
export function packBubbles(
  bubbles: Bubble[],
  options: { height: number; scale?: "linear" | "sqrt"; width: number }
): PackedBubble[] {
  const { height, scale = "linear", width } = options;
  const root = pack<{ children?: Bubble[] } | Bubble>()
    .size([width, height])
    .padding(8)(
    hierarchy<{ children?: Bubble[] } | Bubble>({ children: bubbles })
      .sum((node) =>
        "value" in node
          ? scale === "sqrt"
            ? Math.sqrt(node.value)
            : node.value
          : 0
      )
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  );

  return root.leaves().map((leaf, index) => {
    const bubble = leaf.data as Bubble;
    const fitted = fitBubbleLabel(bubble.label, leaf.r);
    return Object.assign({}, bubble, {
      index,
      lines: fitted?.lines,
      r: leaf.r,
      size: fitted?.size ?? 0,
      x: leaf.x,
      y: leaf.y,
    });
  });
}

/**
 * Packs bubbles into a cluster shaped like the box, so wide or tall boxes are
 * filled. Biggest first, each takes the touching spot closest to the middle.
 */
export function fillBubbles(
  bubbles: Bubble[],
  options: { height: number; width: number }
): PackedBubble[] {
  const { height, width } = options;
  const sorted = bubbles.toSorted((a, b) => b.value - a.value);
  const radii = sorted.map((bubble) => Math.sqrt(bubble.value));
  const gap = (radii.reduce((sum, r) => sum + r, 0) / radii.length) * 0.08;
  const placed: { r: number; x: number; y: number }[] = [];
  const distance = (x: number, y: number) =>
    (x / width) ** 2 + (y / height) ** 2;
  const fits = (x: number, y: number, r: number) =>
    placed.every((c) => Math.hypot(c.x - x, c.y - y) >= c.r + r + gap - 1e-6);

  for (const r of radii) {
    let best = placed.length === 0 ? { x: 0, y: 0 } : undefined;
    for (const c of placed) {
      for (let step = 0; step < 48; step++) {
        const angle = (step / 48) * Math.PI * 2;
        const x = c.x + Math.cos(angle) * (c.r + r + gap);
        const y = c.y + Math.sin(angle) * (c.r + r + gap);
        if (
          (!best || distance(x, y) < distance(best.x, best.y)) &&
          fits(x, y, r)
        ) {
          best = { x, y };
        }
      }
    }
    placed.push({ r, x: best?.x ?? 0, y: best?.y ?? 0 });
  }

  const left = Math.min(...placed.map((c) => c.x - c.r));
  const right = Math.max(...placed.map((c) => c.x + c.r));
  const top = Math.min(...placed.map((c) => c.y - c.r));
  const bottom = Math.max(...placed.map((c) => c.y + c.r));
  const scale = Math.min(width / (right - left), height / (bottom - top));
  const offsetX = (width - (right - left) * scale) / 2;
  const offsetY = (height - (bottom - top) * scale) / 2;

  return placed.map((c, index) => {
    const bubble = sorted[index] as Bubble;
    const r = c.r * scale;
    const fitted = fitBubbleLabel(bubble.label, r);
    return Object.assign({}, bubble, {
      index,
      lines: fitted?.lines,
      r,
      size: fitted?.size ?? 0,
      x: offsetX + (c.x - left) * scale,
      y: offsetY + (c.y - top) * scale,
    });
  });
}

/**
 * The biggest label size that fits a bubble on one or two lines, or nothing.
 * Glyphs average about 0.56em wide.
 */
function fitBubbleLabel(
  text: string,
  r: number
): { lines: string[]; size: number } | undefined {
  const room = r * 1.75;
  const fit = (lines: string[]) => {
    const longest = Math.max(...lines.map((line) => line.length));
    const size = Math.min(
      MAX_FONT,
      r / (lines.length + 1.6),
      room / (longest * 0.56)
    );
    return size >= MIN_FONT ? { lines, size } : undefined;
  };
  const single = fit([text]);
  const space = text.lastIndexOf(" ", Math.ceil(text.length / 2) + 2);
  const hyphen = space > 0 ? -1 : getHyphenIndex(text);
  const split =
    space > 0
      ? fit([text.slice(0, space), text.slice(space + 1)])
      : hyphen > 0
        ? fit([`${text.slice(0, hyphen)}-`, text.slice(hyphen)])
        : undefined;
  if (single && (!split || single.size >= split.size * 0.85)) return single;
  return split ?? single;
}

/**
 * Where a long word can be hyphenated: between a consonant and a vowel, near
 * the middle, like "Internation-alization".
 */
function getHyphenIndex(word: string): number {
  if (word.length <= 12) return -1;
  const isVowel = (char: string | undefined) => /[aeiouy]/i.test(char ?? "");
  let best = -1;
  for (let index = 3; index < word.length - 3; index++) {
    const breaks =
      /[a-z]/i.test(word[index - 1] ?? "") &&
      !isVowel(word[index - 1]) &&
      isVowel(word[index]);
    const middle = word.length / 2;
    if (
      breaks &&
      (best < 0 || Math.abs(index - middle) < Math.abs(best - middle))
    ) {
      best = index;
    }
  }
  return best;
}
