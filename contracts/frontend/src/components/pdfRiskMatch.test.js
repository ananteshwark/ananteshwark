import { describe, expect, it } from 'vitest'
import { findRanges, normalize, ocrIndex, ocrRangeToRects, pageIndex } from './pdfRiskMatch'

// Locating a risk quote on a page and turning the match into rectangles.
//
// This is the part of risk shading that is pure logic and the part that has
// been wrong most often: the ligature/curly-apostrophe mismatch between the
// two text extractors, a clause that failed to match in one piece and so was
// not shaded at all, and — until the OCR path existed — scanned pages that
// could not be shaded on principle. Every one of those was found by hand in a
// browser. This is the harness that should have found them.

// A page of OCR words: two lines at 300dpi on a letter-size scan.
const L1 = 200
const L2 = 260
const H = 30
const WORDS = [
  { t: 'The', x: 100, y: L1, w: 90, h: H },
  { t: 'Vendor', x: 200, y: L1, w: 150, h: H },
  { t: 'shall', x: 360, y: L1, w: 110, h: H },
  { t: 'indemnify', x: 480, y: L1, w: 220, h: H },
  { t: 'the', x: 100, y: L2, w: 80, h: H },
  { t: 'Company', x: 190, y: L2, w: 190, h: H },
  { t: 'without', x: 390, y: L2, w: 170, h: H },
  { t: 'limit', x: 570, y: L2, w: 100, h: H },
]
const PAGE = { w: 2550, h: 3300, words: WORDS }
const VIEWPORT = { width: 765, height: 990 }   // scale = 0.3

const rectsFor = (quote, viewport = VIEWPORT) => {
  const index = ocrIndex(WORDS)
  const ranges = findRanges(index.text, quote)
  return ranges.flatMap((r) => ocrRangeToRects(r, index, WORDS, viewport, PAGE))
}

describe('normalize', () => {
  it('folds the characters the two extractors disagree about', () => {
    // Measured on a real contract: pypdf produced "vendor's" where PDF.js
    // produced "vendor’s", and an exact match over a whole clause was lost.
    expect(normalize('vendor’s')).toBe(normalize("vendor's"))
    expect(normalize('co–operate')).toBe(normalize('co-operate'))
    expect(normalize('ofﬁce')).toBe(normalize('office'))
    expect(normalize('a b')).toBe('a b')
  })

  it('collapses whitespace and trims', () => {
    expect(normalize('  The   Vendor \n shall  ')).toBe('the vendor shall')
  })
})

describe('pageIndex', () => {
  it('keeps the character map aligned with the text', () => {
    // A ligature expands to two characters; one map entry per emitted
    // character is what keeps map.length === text.length.
    const items = [{ str: 'ofﬁce of the', width: 10, height: 10, transform: [1, 0, 0, 1, 0, 0] }]
    const index = pageIndex(items)
    expect(index.map).toHaveLength(index.text.length)
    expect(index.text).toContain('office')
  })

  it('treats hasEOL as a word break', () => {
    const items = [
      { str: 'indemnify', hasEOL: true, width: 10, height: 10, transform: [1, 0, 0, 1, 0, 0] },
      { str: 'the', width: 10, height: 10, transform: [1, 0, 0, 1, 0, 0] },
    ]
    expect(pageIndex(items).text).toBe('indemnify the')
  })
})

describe('findRanges', () => {
  const haystack = ocrIndex(WORDS).text

  it('finds a quote that appears in one piece', () => {
    expect(findRanges(haystack, 'Vendor shall indemnify')).toHaveLength(1)
  })

  it('matches regardless of case', () => {
    expect(findRanges(haystack, 'THE VENDOR SHALL INDEMNIFY')).toHaveLength(1)
  })

  it('does not match a quote that is not on the page', () => {
    expect(findRanges(haystack, 'arbitration in Singapore under SIAC rules')).toEqual([])
  })

  it('ignores a quote too short to be distinctive', () => {
    // Short needles match by accident and shade the wrong words.
    expect(findRanges(haystack, 'the')).toEqual([])
  })

  it('still places the parts it can when the clause does not match whole', () => {
    // One mismatched word in the middle used to mean no highlight at all for
    // the entire clause. Degrading to the runs that do match is the point.
    const quote = 'The Vendor shall indemnify XXXX the Company without limit'
    expect(findRanges(haystack, quote).length).toBeGreaterThan(0)
  })
})

describe('ocrIndex', () => {
  it('reads the page as one normalized string', () => {
    expect(ocrIndex(WORDS).text).toBe('the vendor shall indemnify the company without limit')
  })

  it('keeps the map aligned', () => {
    const index = ocrIndex(WORDS)
    expect(index.map).toHaveLength(index.text.length)
  })

  it('survives a page with no words', () => {
    expect(ocrIndex([]).text).toBe('')
  })
})

describe('ocrRangeToRects', () => {
  const scale = VIEWPORT.width / PAGE.w

  it('draws one box for words on the same line, not one box per word', () => {
    expect(rectsFor('Vendor shall indemnify')).toHaveLength(1)
  })

  it('bounds the box by the matched words', () => {
    const [box] = rectsFor('Vendor shall indemnify')
    expect(box.left).toBeCloseTo(200 * scale, 5)
    expect(box.left + box.width).toBeCloseTo((480 + 220) * scale, 5)
  })

  it('does not shade the word before the match', () => {
    const [box] = rectsFor('Vendor shall indemnify')
    expect(box.left).toBeGreaterThan(100 * scale)
  })

  it('breaks a wrapped quote into one box per line', () => {
    // Otherwise a clause spanning two lines is drawn as a single rectangle
    // swallowing the margin between them.
    const boxes = rectsFor('shall indemnify the Company')
    expect(boxes).toHaveLength(2)
    expect(boxes[0].top).toBeCloseTo(L1 * scale, 5)
    expect(boxes[1].top).toBeCloseTo(L2 * scale, 5)
  })

  it('scales with the viewport, not the OCR pixel size', () => {
    // The page is rendered at whatever width the pane happens to be; the
    // stored boxes are in 300dpi pixels and must follow.
    const [half] = rectsFor('Vendor shall indemnify', { width: 382.5, height: 495 })
    expect(half.left).toBeCloseTo(200 * 0.15, 5)
  })

  it('places nothing for a quote that is not on the page', () => {
    expect(rectsFor('arbitration in Singapore under SIAC rules')).toEqual([])
  })
})
