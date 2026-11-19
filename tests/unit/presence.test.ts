import { describe, expect, test } from 'vitest'

import { countVisitors, getExpiredKeys, getPresenceKey, getPresenceWindow, isVisitorId, PRESENCE_WINDOW_MS } from '../../src/lib/presence'

const ALICE = '6f9b2c1e-1d2a-4f5b-9c3d-0a1b2c3d4e5f'
const BOB = '0a1b2c3d-4e5f-4a5b-8c7d-9e0f1a2b3c4d'

describe('isVisitorId', () => {
  test('accepts random UUIDs only', () => {
    expect(isVisitorId(ALICE)).toBe(true)
    expect(isVisitorId('../../etc/passwd')).toBe(false)
    expect(isVisitorId(42)).toBe(false)
  })
})

describe('getPresenceWindow', () => {
  test('groups timestamps into fixed windows', () => {
    expect(getPresenceWindow(0)).toBe(0)
    expect(getPresenceWindow(PRESENCE_WINDOW_MS - 1)).toBe(0)
    expect(getPresenceWindow(PRESENCE_WINDOW_MS)).toBe(1)
  })
})

describe('countVisitors', () => {
  test('counts a visitor seen in both windows once', () => {
    expect(countVisitors([getPresenceKey(9, ALICE), getPresenceKey(10, ALICE), getPresenceKey(10, BOB)])).toBe(2)
  })
})

describe('getExpiredKeys', () => {
  test('keeps the current and the previous window', () => {
    const keys = [getPresenceKey(8, ALICE), getPresenceKey(9, ALICE), getPresenceKey(10, BOB), 'presence/broken']

    expect(getExpiredKeys(keys, 10)).toEqual([getPresenceKey(8, ALICE), 'presence/broken'])
  })
})
