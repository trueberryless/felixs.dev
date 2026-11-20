import { describe, expect, test } from 'vitest'

import { getPeopleMet, getPlaces } from '../../src/lib/events'

const person = (did: string) => ({ avatar: undefined, did, handle: `${did}.test`, name: did })
const NOW = Date.parse('2026-11-20T00:00:00Z')

describe('events', () => {
  const events = [
    { endDate: '2026-10-01T20:00:00Z', locationText: 'Vienna', people: [person('a'), person('b'), person('did:plc:pbjvqaziagcyv2vqodldn5op')] },
    { endDate: '2026-11-01T20:00:00Z', locationText: 'Vienna', people: [person('a')] },
    { endDate: '2027-01-19T20:00:00Z', locationText: 'Linz', people: [person('c')] },
  ]

  test('ranks the people I met, without me and without upcoming events', () => {
    expect(getPeopleMet(events, NOW).map((p) => [p.did, p.count])).toEqual([
      ['a', 2],
      ['b', 1],
    ])
  })

  test('counts the places', () => {
    expect(getPlaces(events)).toEqual([
      { count: 2, name: 'Vienna' },
      { count: 1, name: 'Linz' },
    ])
  })
})
