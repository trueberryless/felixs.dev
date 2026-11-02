import { describe, expect, test } from 'vitest'

import { applyCache, degradedCache, longLivedCache } from '../../src/lib/cache'

describe('applyCache', () => {
  test('applies the long-lived profile by default', () => {
    const response = { headers: new Headers() }

    applyCache(response)

    expect(response.headers.get('Cache-Control')).toBe(longLivedCache.browser)
    expect(response.headers.get('CDN-Cache-Control')).toBe(longLivedCache.cdn)
    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe(longLivedCache.cdn)
  })

  test('applies the given profile', () => {
    const response = { headers: new Headers() }

    applyCache(response, degradedCache)

    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe(degradedCache.cdn)
  })

  test('caches failures for a shorter time than successes', () => {
    const maxAge = (profile: typeof longLivedCache) => Number(/stale-while-revalidate=(\d+)/.exec(profile.cdn)?.[1])

    expect(maxAge(degradedCache)).toBeLessThan(maxAge(longLivedCache))
  })
})
