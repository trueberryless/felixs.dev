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
 * Packs bubbles into a box, biggest first, and fits each label into its
 * bubble. With `sqrt`, a few huge values don't shrink everything else to dots.
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
 * The biggest label size that fits a bubble, on one line or split over two,
 * or nothing when even the smallest size won't fit. Glyphs are about 0.56em
 * wide on average.
 */
function fitBubbleLabel(
  text: string,
  r: number
): { lines: string[]; size: number } | undefined {
  const room = r * 1.6;
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
  const split =
    space > 0 ? fit([text.slice(0, space), text.slice(space + 1)]) : undefined;
  if (single && (!split || single.size >= split.size * 0.85)) return single;
  return split ?? single;
}
