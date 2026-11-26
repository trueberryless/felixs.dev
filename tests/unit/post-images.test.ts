import { describe, expect, test } from 'vitest'

import { getPostImage } from '../../src/lib/post-images'

describe('getPostImage', () => {
  test('offers a smaller copy of photos for phones', () => {
    const image = getPostImage({ mimeType: 'image/png', ref: { $link: 'cid' } })
    expect(image?.srcset).toMatch(/feed_thumbnail\/.*cid@webp 1000w, .*feed_fullsize\/.*cid@webp 2400w$/)
  })

  test('keeps GIFs as one file', () => {
    expect(getPostImage({ mimeType: 'image/gif', ref: { $link: 'cid' } })?.srcset).toBeUndefined()
  })

  test('shares photos and GIFs as JPEGs', () => {
    expect(getPostImage({ mimeType: 'image/png', ref: { $link: 'cid' } })?.share).toMatch(/feed_fullsize\/.*cid@jpeg$/)
    expect(getPostImage({ mimeType: 'image/gif', ref: { $link: 'cid' } })?.share).toMatch(/feed_fullsize\/.*cid@jpeg$/)
  })
})
