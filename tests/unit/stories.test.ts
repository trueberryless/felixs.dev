import { describe, expect, test } from 'vitest'

import { countByMonth, getMonthlySeries, getSocialActivity, parseResumeDate } from '../../src/lib/stories'

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

describe('getSocialActivity', () => {
  test('counts posts, replies and quotes separately', () => {
    const records = new Map([
      [
        'app.bsky.feed.post',
        [
          { value: { text: 'hi' } },
          { value: { reply: { root: {} }, text: 'yes' } },
          { value: { embed: { $type: 'app.bsky.embed.record' }, text: 'this' } },
          { value: { embed: { $type: 'app.bsky.embed.images' }, text: 'pic' } },
        ],
      ],
      ['app.bsky.feed.like', [{ value: {} }, { value: {} }, { value: {} }]],
      ['sh.tangled.feed.star', [{ value: {} }]],
      ['org.tangled.feed.star', [{ value: {} }]],
    ])

    expect(Object.fromEntries(getSocialActivity(records).map(({ label, value }) => [label, value]))).toEqual({
      Follows: 0,
      Likes: 3,
      Posts: 2,
      Quotes: 1,
      Replies: 1,
      Reposts: 0,
      Stars: 2,
    })
  })
})

describe('parseResumeDate', () => {
  test('reads month and year labels', () => {
    expect(parseResumeDate('Apr 2025')).toBe(Date.UTC(2025, 3, 1))
    expect(parseResumeDate('2019')).toBe(Date.UTC(2019, 0, 1))
    expect(parseResumeDate(null)).toBeNaN()
  })
})

describe('resume', () => {
  test('turns work and education into timeline rows, newest first', async () => {
    const { getCareerRows } = await import('../../src/lib/stories')
    const rows = getCareerRows(
      {
        education: [{ degree: 'BSc', endLabel: null, fieldOfStudy: 'CS', institution: 'TU Wien', isCurrent: true, startLabel: 'Oct 2025' }],
        positions: [{ company: 'Fronius', endLabel: null, isCurrent: true, startLabel: 'Jul 2025', title: 'Developer' }],
      },
      Date.parse('2026-11-19T00:00:00Z')
    )
    expect(rows.map((row) => [row.label, row.kind])).toEqual([
      ['TU Wien', 'education'],
      ['Fronius', 'work'],
    ])
    expect(rows[0]?.title).toBe('BSc, CS, TU Wien')
  })

  test('counts how many positions use a skill', async () => {
    const { getSkillUsage } = await import('../../src/lib/stories')
    expect(getSkillUsage([{ skills: ['C#', '.NET'] }, { skills: ['c#'] }])).toEqual(
      new Map([
        ['c#', 2],
        ['.net', 1],
      ])
    )
  })
})
