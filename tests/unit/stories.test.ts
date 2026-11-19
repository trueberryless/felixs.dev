import { describe, expect, test } from 'vitest'

import { countByMonth, getFootprint, getMonthlySeries, parseResumeDate } from '../../src/lib/stories'

describe('getMonthlySeries', () => {
  test('returns every month up to now, including quiet ones', () => {
    const series = getMonthlySeries(new Map([['2026-10', 4]]), Date.parse('2026-11-19T00:00:00Z'), 3)

    expect(series.map(({ label, value }) => [label, value])).toEqual([
      ['Sep', 0],
      ['Oct', 4],
      ['Nov', 0],
    ])
    expect(series[1]?.title).toBe('October 2026: 4')
  })
})

describe('countByMonth', () => {
  test('skips invalid dates', () => {
    const counts = countByMonth(['2026-01-02', '2026-01-30', 'nope', undefined], (date) => date)

    expect([...counts]).toEqual([['2026-01', 2]])
  })
})

describe('getFootprint', () => {
  test('groups collections into apps by their namespace', () => {
    const footprint = getFootprint(
      new Map([
        ['fm.teal.feed.play', 100],
        ['fm.teal.actor.status', 1],
        ['app.bsky.feed.like', 40],
        ['chat.bsky.actor.declaration', 1],
        ['buzz.bookhive.book', 30],
      ]),
      { did: 'did:plc:abc', limit: 10 }
    )

    expect(footprint.map(({ label, value }) => [label, value])).toEqual([
      ['teal.fm', 101],
      ['Bluesky', 41],
      ['bookhive.buzz', 30],
    ])
    expect(footprint[0]?.title).toBe('teal.fm: 101 records in 2 collections')
  })
})

describe('parseResumeDate', () => {
  test('reads month and year labels', () => {
    expect(parseResumeDate('Apr 2025')).toBe(Date.UTC(2025, 3, 1))
    expect(parseResumeDate('2019')).toBe(Date.UTC(2019, 0, 1))
    expect(parseResumeDate(null)).toBeNaN()
  })
})
