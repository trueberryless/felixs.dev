import { beforeEach, describe, expect, test, vi } from 'vitest'

const saved = new Map<string, unknown>()
let onNetlify = true

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    get: async (key: string) => saved.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => {
      saved.set(key, value)
    },
  }),
}))
vi.mock('../../src/lib/netlify', () => ({ isOnNetlify: () => onNetlify }))

const { loadCached } = await import('../../src/lib/data-cache')

const day = 24 * 60 * 60 * 1000
const save = (value: string, ageMs: number) => saved.set('v1/key', { savedAt: Date.now() - ageMs, value })

beforeEach(() => {
  saved.clear()
  onNetlify = true
})

describe('loadCached', () => {
  test('uses a copy younger than a day without loading', async () => {
    save('saved', 2 * 60 * 60 * 1000)
    const load = vi.fn(async () => 'fresh')

    expect(await loadCached('key', load)).toBe('saved')
    expect(load).not.toHaveBeenCalled()
  })

  test('answers with a stale copy and refreshes it in the background', async () => {
    save('saved', 3 * day)
    const background: Promise<unknown>[] = []
    const locals = { netlify: { context: { waitUntil: (promise: Promise<unknown>) => background.push(promise) } } }

    expect(await loadCached('key', async () => 'fresh', locals)).toBe('saved')
    await Promise.all(background)
    expect(saved.get('v1/key')).toMatchObject({ value: 'fresh' })
  })

  test('waits for fresh data when nothing can work in the background', async () => {
    save('saved', 3 * day)

    expect(await loadCached('key', async () => 'fresh')).toBe('fresh')
  })

  test('falls back on a copy up to eight weeks old when loading fails', async () => {
    save('saved', 30 * day)

    expect(await loadCached('key', async () => null)).toBe('saved')
    expect(await loadCached('key', async () => Promise.reject(new Error('down')))).toBe('saved')
  })

  test('drops a copy older than eight weeks', async () => {
    save('saved', 60 * day)

    expect(await loadCached('key', async () => null)).toBeNull()
  })

  test('only loads outside of Netlify', async () => {
    onNetlify = false
    save('saved', 0)

    expect(await loadCached('key', async () => 'fresh')).toBe('fresh')
  })
})
