import { describe, expect, test } from 'vitest'

import { type Book, buildReadingSummary } from '../../src/lib/data'

function createBook(book: Partial<Book> & Pick<Book, 'hiveId'>): Book {
  return { authors: 'Author', coverUrl: null, id: book.hiveId, rotation: '0', thickness: 20, title: book.hiveId, ...book }
}

describe('buildReadingSummary', () => {
  test('returns nothing without books', () => {
    expect(buildReadingSummary([])).toBeNull()
  })

  test('uses the most recently finished or started book as the latest', () => {
    const summary = buildReadingSummary([
      createBook({ finishedAt: '2026-01-01', hiveId: 'old' }),
      createBook({ hiveId: 'new', startedAt: '2026-06-01' }),
    ])

    expect(summary?.latest).toEqual({ hiveId: 'new', startedAt: '2026-06-01', title: 'new' })
  })

  test('lists at most three favorites, best first and without the latest book', () => {
    const summary = buildReadingSummary([
      createBook({ finishedAt: '2026-06-01', hiveId: 'latest', stars: 5 }),
      createBook({ finishedAt: '2026-05-01', hiveId: 'a', stars: 3 }),
      createBook({ finishedAt: '2026-04-01', hiveId: 'b', stars: 5 }),
      createBook({ finishedAt: '2026-03-01', hiveId: 'c', stars: 4 }),
      createBook({ finishedAt: '2026-02-01', hiveId: 'd', stars: 1 }),
      createBook({ finishedAt: '2026-01-01', hiveId: 'unrated' }),
    ])

    expect(summary?.favorites.map(({ hiveId }) => hiveId)).toEqual(['b', 'c', 'a'])
  })
})
