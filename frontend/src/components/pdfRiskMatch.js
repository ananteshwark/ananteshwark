// Locating a risk quote on a rendered PDF page, and turning the match into
// rectangles to shade.
//
// Split out of PdfRiskOverlay.jsx because it is pure logic with no React in it:
// it is the part worth unit-testing on its own, and keeping non-component
// exports out of a component file is what the react-refresh rule asks for.
import * as pdfjs from 'pdfjs-dist'

// Risk spans arrive as offsets into the *extracted* text, which is not the text
// PDF.js reads off the page: the extractor and the renderer disagree about line
// breaks, ligatures and column order. So the offsets cannot be carried over —
// the quote has to be found again in each page's own text.
//
// This mirrors the server's anchoring (services/text_anchor.py): try the
// whitespace-normalized quote, then its longest distinctive fragment. Anything
// that still cannot be placed is reported rather than silently dropped, exactly
// as the extracted-text view does.
// The two extractors disagree in small, predictable ways. Measured on a plain
// generated contract, pypdf produced "vendor's" where PDF.js produced
// "vendor’s" — one curly apostrophe, and an exact match over a whole clause is
// lost. Real documents add ligatures, non-breaking spaces and dash variants.
// Folding these to their plain equivalents removes most of the disagreement
// before matching.
//
// Every fold must keep the character map aligned, so a substitution that
// lengthens the text (the ﬁ ligature becoming two characters) records one map
// entry per output character. See pageIndex.
const FOLD = {
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'", '\u02BC': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u2033': '"',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-',
  '\u2015': '-', '\u2212': '-',
  '\u00A0': ' ', '\u2007': ' ', '\u202F': ' ', '\u200B': '',
  '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl',
  '\u2026': '...',
}

export function fold(ch) {
  const mapped = FOLD[ch]
  return mapped === undefined ? ch.toLowerCase() : mapped
}

export function normalize(s) {
  let out = ''
  for (const ch of (s || '')) out += /\s/.test(ch) ? ' ' : fold(ch)
  return out.replace(/\s+/g, ' ').trim()
}

// Concatenate a page's text items into one normalized string, remembering which
// item (and which offset inside it) each character came from.
export function pageIndex(items) {
  let text = ''
  const map = []                       // map[i] = { itemIndex, offset } for text[i]
  let lastWasSpace = true
  items.forEach((item, itemIndex) => {
    const raw = item.str || ''
    for (let k = 0; k < raw.length; k++) {
      const ch = raw[k]
      if (/\s/.test(ch)) {
        if (lastWasSpace) continue
        text += ' '; map.push({ itemIndex, offset: k }); lastWasSpace = true
      } else {
        const folded = fold(ch)
        // One map entry per emitted character keeps map.length === text.length
        // even when a ligature expands.
        for (const _ of folded) map.push({ itemIndex, offset: k })
        text += folded
        if (folded) lastWasSpace = false
      }
    }
    // PDF.js marks a line break with hasEOL rather than a newline character.
    if (item.hasEOL && !lastWasSpace) {
      text += ' '; map.push({ itemIndex, offset: raw.length }); lastWasSpace = true
    }
  })
  return { text, map }
}

// Words per anchor when the whole quote cannot be found in one piece. Short
// enough to survive a stray character, long enough not to match by accident.
const ANCHOR_WORDS = 6
const MIN_ANCHOR_CHARS = 18
// Anchors closer than this are one highlight; the gap is the text between them
// that failed to match, and shading it keeps the clause visually whole.
const MERGE_GAP = 80

function mergeRanges(ranges) {
  if (!ranges.length) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const out = [sorted[0]]
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1]
    if (r.start - last.end <= MERGE_GAP) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

// Every part of the quote that can be located on this page.
//
// This used to return a single range and give up entirely if the clause could
// not be matched in one piece — so one mismatched character anywhere in a
// clause meant no highlight at all for it. Matching a sequence of short runs
// instead degrades gracefully: the parts that are found still get shaded.
export function findRanges(haystack, quote) {
  const needle = normalize(quote)
  if (needle.length < 8) return []
  const whole = haystack.indexOf(needle)
  if (whole >= 0) return [{ start: whole, end: whole + needle.length }]

  const words = needle.split(' ').filter(Boolean)
  const hits = []
  let from = 0
  for (let i = 0; i < words.length; i += ANCHOR_WORDS) {
    const run = words.slice(i, i + ANCHOR_WORDS).join(' ')
    if (run.length < MIN_ANCHOR_CHARS) continue
    // Anchors are searched in order, so a repeated phrase cannot drag the
    // highlight backwards into an earlier part of the page.
    const at = haystack.indexOf(run, from)
    if (at < 0) continue
    hits.push({ start: at, end: at + run.length })
    from = at + run.length
  }
  return mergeRanges(hits)
}

// A scanned page has no text layer at all, so everything above finds nothing to
// match against. For those documents the server records where each word sat
// when it was OCR'd (services/text_extraction), and the same matching runs
// against that instead.
//
// Deliberately the same {text, map} shape pageIndex returns, so findRanges is
// shared: the anchoring rules that took several rounds to get right should not
// exist twice.
export function ocrIndex(words) {
  let text = ''
  const map = []
  words.forEach((w, i) => {
    const raw = w.t || ''
    if (!raw) return
    if (text) {
      // The separator belongs to the word before it. Attributing it forward
      // would let a range ending on a space drag the next word's box in.
      text += ' '
      map.push({ itemIndex: Math.max(i - 1, 0), offset: 0 })
    }
    for (let k = 0; k < raw.length; k++) {
      const folded = fold(raw[k])
      for (const _ of folded) map.push({ itemIndex: i, offset: k })
      text += folded
    }
  })
  return { text, map }
}

// Words are individual boxes, but a highlight drawn as one rectangle per word
// looks like a ransom note. Consecutive words sitting on the same line are
// merged into a single box; a new box starts when the range wraps to the next
// line, which is what keeps a wrapped clause from being drawn as one rectangle
// swallowing the margin between lines.
export function ocrRangeToRects(range, index, words, viewport, page) {
  const sx = viewport.width / (page.w || 1)
  const sy = viewport.height / (page.h || 1)
  const touched = []
  for (let i = range.start; i < range.end && i < index.map.length; i++) {
    const wi = index.map[i].itemIndex
    if (touched[touched.length - 1] !== wi) touched.push(wi)
  }
  const rects = []
  let run = null
  const flush = () => {
    if (!run) return
    rects.push({
      left: run.x0 * sx, top: run.y0 * sy,
      width: Math.max((run.x1 - run.x0) * sx, 2), height: (run.y1 - run.y0) * sy,
    })
    run = null
  }
  for (const wi of touched) {
    const w = words[wi]
    if (!w) continue
    // Same line when the vertical centres are within half a line height —
    // OCR baselines wobble by a pixel or two even on a clean scan.
    const sameLine = run && Math.abs((w.y + w.h / 2) - (run.y0 + (run.y1 - run.y0) / 2)) < w.h * 0.6
    if (!sameLine) flush()
    if (run) {
      run.x0 = Math.min(run.x0, w.x); run.x1 = Math.max(run.x1, w.x + w.w)
      run.y0 = Math.min(run.y0, w.y); run.y1 = Math.max(run.y1, w.y + w.h)
    } else {
      run = { x0: w.x, x1: w.x + w.w, y0: w.y, y1: w.y + w.h }
    }
  }
  flush()
  return rects
}

// Turn a character range into one rectangle per text item it covers. Splitting
// per item is what keeps a highlight that wraps across lines or columns from
// being drawn as one box swallowing everything between them.
export function rangeToRects(range, index, items, viewport) {
  const touched = new Map()
  for (let i = range.start; i < range.end && i < index.map.length; i++) {
    const { itemIndex } = index.map[i]
    const span = touched.get(itemIndex) || { first: i, last: i }
    span.last = i
    touched.set(itemIndex, span)
  }
  const rects = []
  for (const [itemIndex, span] of touched) {
    const item = items[itemIndex]
    if (!item || !item.width) continue
    const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, item.transform)
    const w = item.width * viewport.scale
    const h = (item.height || 10) * viewport.scale
    // Trim the box to the covered slice of the item, so a highlight starting
    // mid-sentence does not shade the words before it.
    const len = (item.str || '').length || 1
    const from = index.map[span.first].offset / len
    const to = Math.min((index.map[span.last].offset + 1) / len, 1)
    rects.push({ left: x + w * from, top: y - h, width: Math.max(w * (to - from), 2), height: h * 1.15 })
  }
  return rects
}
