import { describe, expect, test } from 'vitest'

import type { AugmentedPost } from '../../src/lib/data'
import { getPostPath, groupPostsByYear } from '../../src/lib/posts'

function createPost(data: Partial<AugmentedPost['data']> = {}, id = 'post'): AugmentedPost {
  return { data: { publishedAt: '2026-03-05T12:00:00Z', title: 'Hello', ...data }, id }
}

describe('getPostPath', () => {
  test('links to the post on this site by its record key', () => {
    expect(getPostPath(createPost({}, 'at://did:plc:abc/site.standard.document/3mqaov5uzks2x'))).toBe('/blog/3mqaov5uzks2x')
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
