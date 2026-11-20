import { describe, expect, test } from 'vitest'

import { getAuthors, getBooksPerYear, getPagesRead } from '../../src/lib/books'

const books = [
  { authors: 'Sarah J. Maas', finishedAt: '2024-03-01', pages: 400 },
  { authors: 'Sarah J. Maas', finishedAt: '2026-01-10', pages: 600 },
  { authors: 'Brandon Sanderson', finishedAt: '2026-05-02' },
]

describe('books', () => {
  test('counts books per year, quiet years included', () => {
    expect(getBooksPerYear(books, Date.parse('2026-11-20'))).toEqual([
      { count: 1, year: 2024 },
      { count: 0, year: 2025 },
      { count: 2, year: 2026 },
    ])
  })

  test('ranks authors and adds up known pages', () => {
    expect(getAuthors(books)[0]).toEqual({ count: 2, name: 'Sarah J. Maas' })
    expect(getPagesRead(books)).toBe(1000)
  })
})
