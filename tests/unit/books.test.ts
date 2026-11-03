import { describe, expect, test } from 'vitest'

import { getBookThickness } from '../../src/lib/books'

describe('getBookThickness', () => {
  test('scales linearly for typical books', () => {
    const short = getBookThickness(300)
    const medium = getBookThickness(500)
    const long = getBookThickness(700)

    // Rounding to whole pixels may shift either step by one.
    expect(Math.abs(long - medium - (medium - short))).toBeLessThanOrEqual(1)
    expect(long).toBeGreaterThan(medium)
  })

  test('keeps outliers apart until they reach a limit', () => {
    expect(getBookThickness(100)).toBeLessThan(getBookThickness(150))
    expect(getBookThickness(1000)).toBeGreaterThan(getBookThickness(900))
  })

  test('shares the limits between extreme books', () => {
    expect(getBookThickness(1)).toBe(getBookThickness(30))
    expect(getBookThickness(1100)).toBe(getBookThickness(5000))
  })

  test('never steps back as books get longer', () => {
    let previous = 0
    for (let pages = 1; pages <= 1500; pages++) {
      const thickness = getBookThickness(pages)
      expect(thickness).toBeGreaterThanOrEqual(previous)
      previous = thickness
    }
  })
})
