import { describe, expect, test } from 'vitest'

import { applyCache, dataCache, degradedCache, liveCache } from '../../src/lib/cache'

describe('applyCache', () => {
  test('applies the data profile by default', () => {
    const response = { headers: new Headers() }

    applyCache(response)

    expect(response.headers.get('Cache-Control')).toBe(dataCache.browser)
    expect(response.headers.get('CDN-Cache-Control')).toBe(dataCache.cdn)
    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe(dataCache.cdn)
  })

  test('applies the given profile', () => {
    const response = { headers: new Headers() }

    applyCache(response, degradedCache)

    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe(degradedCache.cdn)
  })

  test('caches failures for a shorter time than successes', () => {
    const maxAge = (profile: typeof dataCache) => Number(/stale-while-revalidate=(\d+)/.exec(profile.cdn)?.[1])

    expect(maxAge(degradedCache)).toBeLessThan(maxAge(dataCache))
  })

  test('keeps data fresh for a day, refreshes it for two weeks and falls back on it for eight', () => {
    const seconds = (name: string) => Number(new RegExp(`${name}=(\\d+)`).exec(dataCache.cdn)?.[1])
    const day = 24 * 60 * 60

    expect(seconds('s-maxage')).toBe(day)
    expect(seconds('stale-while-revalidate')).toBe(14 * day)
    expect(seconds('stale-if-error')).toBe(56 * day)
  })

  test('keeps live records fresh for a minute, refreshes them for two weeks and falls back on them for eight', () => {
    const seconds = (name: string) => Number(new RegExp(`${name}=(\\d+)`).exec(liveCache.cdn)?.[1])
    const day = 24 * 60 * 60

    expect(seconds('s-maxage')).toBe(60)
    expect(seconds('stale-while-revalidate')).toBe(14 * day)
    expect(seconds('stale-if-error')).toBe(56 * day)
    expect(liveCache.browser).toBe('public, max-age=60')
  })
})
