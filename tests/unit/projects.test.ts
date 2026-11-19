import { describe, expect, test } from 'vitest'

import { getLanes, getMonthlyCounts, getTopRepos, getTotals } from '../../src/lib/projects'

const pr = (repo: string, mergedAt: string) => ({ mergedAt, repo, title: 'x', url: 'https://github.com/x' })

const orgs = [
  {
    name: 'Astro',
    owner: 'withastro',
    pullRequests: [pr('withastro/starlight', '2024-03-02T10:00:00Z'), pr('withastro/docs', '2023-11-20T10:00:00Z'), pr('withastro/starlight', '2024-03-09T10:00:00Z')],
    url: 'https://astro.build',
  },
  { name: 'npmx', owner: 'npmx-dev', pullRequests: [pr('npmx-dev/npmx.dev', '2026-01-05T10:00:00Z')], url: 'https://npmx.dev' },
  { name: 'Quiet', owner: 'quiet', pullRequests: [], url: 'https://example.com' },
]

describe('projects', () => {
  test('orders lanes by the first contribution and skips empty ones', () => {
    const lanes = getLanes(orgs)
    expect(lanes.map((lane) => [lane.name, lane.count])).toEqual([
      ['Astro', 3],
      ['npmx', 1],
    ])
    expect(lanes[0]?.first).toBe(Date.parse('2023-11-20T10:00:00Z'))
  })

  test('adds up the totals', () => {
    expect(getTotals(orgs)).toEqual({ firstYear: 2023, organisations: 2, pullRequests: 4, repositories: 3 })
  })

  test('counts every month, quiet ones included', () => {
    const months = getMonthlyCounts(orgs, Date.parse('2026-02-01T00:00:00Z'))
    expect(months[0]).toEqual({ count: 1, month: '2023-11' })
    expect(months.find((month) => month.month === '2024-03')?.count).toBe(2)
    expect(months.at(-1)).toEqual({ count: 0, month: '2026-02' })
    expect(months).toHaveLength(28)
  })

  test('ranks the repositories', () => {
    expect(getTopRepos(orgs[0]!.pullRequests)).toEqual([
      { count: 2, name: 'starlight' },
      { count: 1, name: 'docs' },
    ])
  })
})
