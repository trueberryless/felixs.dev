import { describe, expect, test } from 'vitest'

import { collectFootnotes, getBlobCid, getDocumentBlocks, getReadingMinutes, toSegments } from '../../src/lib/leaflet'
import { collectProfiles, segmentsToHtml } from '../../src/lib/leaflet-html'

const link = (uri: string) => ({ $type: 'pub.leaflet.richtext.facet#link', uri })
const bold = { $type: 'pub.leaflet.richtext.facet#bold' }

describe('toSegments', () => {
  test('splits text at facet boundaries and combines overlapping facets', () => {
    const facets = [
      { features: [link('https://example.com')], index: { byteEnd: 11, byteStart: 4 } },
      { features: [bold], index: { byteEnd: 8, byteStart: 4 } },
    ]

    expect(toSegments('See the docs.', facets)).toEqual([
      { text: 'See ' },
      { bold: true, link: 'https://example.com', text: 'the ' },
      { link: 'https://example.com', text: 'doc' },
      { text: 's.' },
    ])
  })

  test('uses byte offsets, so text after emoji lines up', () => {
    // "📜" is four bytes long.
    expect(toSegments('📜 here', [{ features: [bold], index: { byteEnd: 9, byteStart: 5 } }])).toEqual([
      { text: '📜 ' },
      { bold: true, text: 'here' },
    ])
  })

  test('ignores empty and out of range facets', () => {
    expect(toSegments('abc', [{ features: [bold], index: { byteEnd: 2, byteStart: 2 } }, { features: [bold], index: { byteEnd: 99, byteStart: 50 } }])).toEqual([
      { text: 'abc' },
    ])
  })
})

describe('collectFootnotes', () => {
  test('numbers footnotes in order of appearance', () => {
    const footnote = (id: string, text: string) => ({
      contentPlaintext: text,
      footnoteId: id,
      $type: 'pub.leaflet.richtext.facet#footnote',
    })
    const blocks = [
      { $type: 'pub.leaflet.blocks.text', facets: [{ features: [footnote('b', 'Second')] }] },
      { $type: 'pub.leaflet.blocks.text', facets: [{ features: [footnote('a', 'First'), footnote('b', 'Second')] }] },
    ]

    expect(collectFootnotes(blocks).map(({ id, number }) => [id, number])).toEqual([
      ['b', 1],
      ['a', 2],
    ])
  })
})

describe('getDocumentBlocks', () => {
  test('flattens the pages of a document', () => {
    const content = {
      pages: [
        { blocks: [{ block: { $type: 'pub.leaflet.blocks.text', plaintext: 'a' } }] },
        { blocks: [{ block: { $type: 'pub.leaflet.blocks.horizontalRule' } }, { block: null }] },
      ],
    }

    expect(getDocumentBlocks(content).map((block) => block.$type)).toEqual(['pub.leaflet.blocks.text', 'pub.leaflet.blocks.horizontalRule'])
  })
})

describe('getReadingMinutes', () => {
  test('counts the words outside code blocks', () => {
    const words = Array.from({ length: 440 }, () => 'word').join(' ')

    expect(getReadingMinutes([{ $type: 'pub.leaflet.blocks.text', plaintext: words }, { $type: 'pub.leaflet.blocks.code', plaintext: words }])).toBe(2)
  })
})

describe('getBlobCid', () => {
  test('reads the CID of a blob reference', () => {
    expect(getBlobCid({ ref: { $link: 'bafy' } })).toBe('bafy')
    expect(getBlobCid(undefined)).toBeUndefined()
  })
})

describe('segmentsToHtml', () => {
  test('escapes text and drops unsafe links', async () => {


    expect(segmentsToHtml([{ link: 'javascript:alert(1)', text: '<b>' }, { bold: true, link: 'https://x.dev', text: 'ok' }])).toBe(
      '&lt;b&gt;<a href="https://x.dev"><strong>ok</strong></a>'
    )
  })

  test('replaces footnote markers with their number', async () => {

    const footnotes = [{ id: 'a', number: 1, segments: [] }]

    expect(segmentsToHtml([{ text: 'cute' }, { footnote: 'a', text: '*' }], footnotes)).toBe(
      'cute<sup class="post-footnote-ref"><a id="fnref-1" href="#fn-1" aria-label="Footnote 1">1</a></sup>'
    )
  })
})

describe('badges', () => {
  test('turns GitHub profiles and mentions into badges with avatars', () => {
    const html = segmentsToHtml(
      [
        { link: 'https://github.com/HiDeoo', text: 'HiDeoo' },
        { text: ' and ' },
        { mention: 'did:plc:abc', text: '@someone.dev' },
        { link: 'https://github.com/withastro/starlight', text: 'Starlight' },
      ],
      [],
      { avatars: new Map([['did:plc:abc', 'https://cdn.example/a.jpg']]) }
    )
    expect(html).toContain('<a class="post-badge is-github" href="https://github.com/HiDeoo"><img src="https://github.com/HiDeoo.png?size=64"')
    expect(html).toContain('<a class="post-badge is-bluesky" href="https://bsky.app/profile/did:plc:abc"><img src="https://cdn.example/a.jpg"')
    expect(html).toContain('<a href="https://github.com/withastro/starlight">Starlight</a>')
  })

  test('collects the profiles a post names', () => {
    expect(
      collectProfiles([
        { mention: 'did:plc:abc', text: '@a' },
        { link: 'https://bsky.app/profile/felixs.dev', text: 'me' },
        { link: 'https://example.com', text: 'x' },
      ])
    ).toEqual(['did:plc:abc', 'felixs.dev'])
  })
})
