import { describe, expect, test } from 'vitest'

import type { AugmentedPost } from '../../src/lib/data'
import { groupPostsByYear, processPost } from '../../src/lib/posts'

function createPost(data: Partial<AugmentedPost['data']> = {}, id = 'post'): AugmentedPost {
  return { data: { publishedAt: '2026-03-05T12:00:00Z', title: 'Hello', ...data }, id }
}

describe('processPost', () => {
  test('formats the date in UTC', () => {
    expect(processPost(createPost({ publishedAt: '2026-03-05T23:59:00Z' })).formattedDate).toBe('MAR.05')
  })

  test.each(['', 'not a date'])('shows N/A for the date %j', (publishedAt) => {
    expect(processPost(createPost({ publishedAt })).formattedDate).toBe('N/A')
  })

  test('falls back to a title for untitled posts', () => {
    expect(processPost(createPost({ title: '' })).title).toBe('Untitled Blog Post')
  })

  test('joins the publication url and the path', () => {
    const post = createPost({ path: 'a', publication: { url: 'https://example.com/' } })

    expect(processPost(post).postUrl).toBe('https://example.com/a')
    expect(processPost(createPost({ path: '/a', publication: { url: 'https://example.com' } })).postUrl).toBe(
      'https://example.com/a',
    )
  })

  test.each([
    createPost(),
    createPost({ path: 'a' }),
    createPost({ path: 'a', publication: { url: 'javascript:alert(1)' } }),
    createPost({ publication: { url: 'https://example.com' } }),
  ])('does not link to unsafe or incomplete urls', (post) => {
    expect(processPost(post).postUrl).toBe('#')
  })

  test('splits the tags', () => {
    expect(processPost(createPost({ tags: ['a', 'b', 'c'] }))).toMatchObject({ firstTag: 'a', otherTags: 'b  c' })
    expect(processPost(createPost())).toMatchObject({ firstTag: undefined, otherTags: '' })
  })
})

describe('groupPostsByYear', () => {
  test('groups posts by year, newest first', () => {
    const newer = createPost({ publishedAt: '2026-05-01T00:00:00Z' }, 'newer')
    const older = createPost({ publishedAt: '2025-05-01T00:00:00Z' }, 'older')
    const oldest = createPost({ publishedAt: '2025-01-01T00:00:00Z' }, 'oldest')

    const { postsByYear, years } = groupPostsByYear([oldest, newer, older])

    expect(years).toEqual(['2026', '2025'])
    expect(postsByYear['2025']?.map(({ id }) => id)).toEqual(['older', 'oldest'])
  })

  test('handles no posts', () => {
    expect(groupPostsByYear([])).toEqual({ postsByYear: {}, years: [] })
  })
})
