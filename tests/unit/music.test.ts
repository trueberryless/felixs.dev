import { describe, expect, test } from 'vitest'

import { computeMusicStats, recordToPlay } from '../../src/lib/music'
import type { Play } from '../../src/lib/music'

const NOW = Date.parse('2026-11-19T12:00:00Z')

function play(at: string, track: string, artists: string[], durationS = 180): Play {
  return { album: 'Album', artists, at: Date.parse(at), durationS, track, url: `https://open.spotify.com/track/${track}` }
}

describe('recordToPlay', () => {
  test('reads a teal.fm play', () => {
    expect(
      recordToPlay({
        artists: [{ artistName: 'Animadrop' }, { artistName: 'Someone' }],
        duration: 218,
        originUri: 'https://open.spotify.com/track/1',
        playedTime: '2026-10-31T15:28:39.000Z',
        releaseName: 'The Lost Ones',
        trackName: 'Charred',
      })
    ).toEqual({
      album: 'The Lost Ones',
      artists: ['Animadrop', 'Someone'],
      at: Date.parse('2026-10-31T15:28:39.000Z'),
      durationS: 218,
      track: 'Charred',
      url: 'https://open.spotify.com/track/1',
    })
  })

  test('skips records without a time or a track name', () => {
    expect(recordToPlay({ trackName: 'x' })).toBeUndefined()
    expect(recordToPlay({ playedTime: '2026-01-01T00:00:00Z' })).toBeUndefined()
    expect(recordToPlay(null)).toBeUndefined()
  })
})

describe('computeMusicStats', () => {
  const plays = [
    play('2024-03-01T10:00:00Z', 'a', ['Alpha']),
    play('2026-11-17T21:30:00Z', 'b', ['Beta', 'Alpha']),
    play('2026-11-18T08:00:00Z', 'b', ['Beta', 'Alpha']),
    play('2026-11-18T08:05:00Z', 'b', ['Beta', 'Alpha']),
    play('2026-11-19T07:00:00Z', 'c', ['Gamma'], 120),
  ]
  const stats = computeMusicStats(plays, { nowMs: NOW })
  const range = (id: string) => stats.ranges.find((candidate) => candidate.id === id)

  test('ranks artists and tracks per range, crediting every artist', () => {
    expect(range('4w')?.plays).toBe(4)
    expect(range('4w')?.topArtists.map((artist) => [artist.name, artist.plays])).toEqual([
      ['Alpha', 3],
      ['Beta', 3],
      ['Gamma', 1],
    ])
    expect(range('4w')?.topTracks[0]).toMatchObject({ artist: 'Beta', name: 'b', plays: 3 })
    expect(range('all')?.plays).toBe(5)
    expect(stats.ranges.map(({ id }) => id)).toEqual(['4w', '6m', '12m', 'all', '2026', '2024'])
  })

  test('counts hours in local time', () => {
    // 21:30 UTC is 22:30 in Vienna in November.
    expect(range('4w')?.hours[22]).toBe(1)
  })

  test('finds the highlights', () => {
    expect(stats.highlights.longestStreak).toEqual({ days: 3, from: '2026-11-17', to: '2026-11-19' })
    expect(stats.highlights.busiestDay).toEqual({ date: '2026-11-18', plays: 2 })
    expect(stats.highlights.topRepeat).toMatchObject({ plays: 2, track: 'b' })
    expect(stats.highlights.weekObsession).toMatchObject({ artist: 'Beta', plays: 3, track: 'b' })
  })

  test('keeps a daily history and the top artists per month', () => {
    expect(stats.daily.start).toBe('2024-03-01')
    expect(stats.daily.counts.at(-1)).toBe(1)
    expect(stats.daily.counts.reduce((sum, count) => sum + count, 0)).toBe(5)
    expect(stats.months.at(-1)).toMatchObject({ month: '2026-11', plays: 4 })
    expect(stats.months.at(-1)?.artists[0]).toEqual({ name: 'Alpha', plays: 3 })
  })
})
