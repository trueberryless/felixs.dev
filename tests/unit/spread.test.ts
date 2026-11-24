import { describe, expect, test } from 'vitest'

import { getSpacing, spreadOut, type Point, type Rect } from '../../src/lib/spread'

const box: Rect = { bottom: 900, left: 0, right: 1440, top: 0 }
const name: Rect = { bottom: 520, left: 300, right: 1140, top: 380 }
const header: Rect = { bottom: 64, left: 360, right: 1080, top: 16 }
const obstacles = [
  { rect: name, share: 0.5 },
  { rect: header, share: 0.3 },
]

// Clumped seeds on purpose: everything starts in one corner.
const seeds: Point[] = Array.from({ length: 18 }, (_, index) => ({
  x: 100 + (index % 4) * 10,
  y: 100 + Math.floor(index / 4) * 10,
}))

const distanceTo = (rect: Rect, point: Point) =>
  Math.hypot(
    point.x - Math.min(Math.max(point.x, rect.left), rect.right),
    point.y - Math.min(Math.max(point.y, rect.top), rect.bottom),
  )

describe('spreadOut', () => {
  const points = spreadOut(seeds, box, obstacles)
  const spacing = getSpacing(seeds.length, box, obstacles)

  test('spreads clumped points out evenly', () => {
    const nearest = points.map((point, index) =>
      Math.min(...points.filter((_, other) => other !== index).map((other) => Math.hypot(point.x - other.x, point.y - other.y))),
    )
    expect(Math.min(...nearest)).toBeGreaterThan(spacing * 0.7)
    expect(Math.max(...nearest) / Math.min(...nearest)).toBeLessThan(1.6)
  })

  test('keeps clear of the name and the header', () => {
    for (const point of points) {
      expect(distanceTo(name, point)).toBeGreaterThan(spacing * 0.4)
      expect(distanceTo(header, point)).toBeGreaterThan(spacing * 0.2)
    }
  })

  test('uses the whole box, not only the area around the seeds', () => {
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(box.right * 0.7)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(box.bottom * 0.6)
  })

  test('gives the same layout for the same seeds', () => {
    expect(spreadOut(seeds, box, obstacles)).toEqual(points)
  })
})
