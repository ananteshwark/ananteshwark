import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { findRanges, ocrIndex, ocrRangeToRects, pageIndex, rangeToRects } from './pdfRiskMatch'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

// The worker is bundled and served from our own origin — nothing is fetched
// from a CDN, so this renders on an air-gapped server.
//
// `?worker` rather than `?url` on purpose. Loading it by URL made the worker
// the only `.mjs` file in the build, and nginx's stock mime.types has no entry
// for that extension: it went out as application/octet-stream, and because we
// send X-Content-Type-Options: nosniff the browser refused the module import —
// "Failed to fetch dynamically imported module". Every other asset was fine,
// being `.js`. Vite bundles this form as an ordinary worker script instead, so
// the deployment no longer depends on the server knowing a MIME type it may
// not have been told about.
//
// Constructed on first use rather than at import: a throw at module scope would
// reject this lazily-imported chunk and take the whole contract page with it,
// which is a poor trade for an optional overlay. Failing here just means the
// caller shows the browser's own viewer.
// A fresh port per mount, not one cached for the lifetime of the tab.
//
// This component's cleanup destroys the document, and destroying a document
// destroys the worker behind the port it was loaded through. With one port
// cached at module scope, a second mount handed pdf.js a port whose worker was
// already being torn down and getDocument threw
//
//   PDFWorker.fromPort - the worker is being destroyed.
//
// which the caller turns into "showing the document in the browser's viewer,
// which cannot be shaded" — the document renders, unshaded, with the failure
// only in a console warning.
//
// Measured: under React StrictMode, whose double-mount is exactly this
// sequence, that was 6 failures in 6 runs — so the feature was broken in every
// development session. A production build mounts once and did not reproduce it
// (0 in 6), so this was not breaking the deployed system. It is still wrong:
// destroying a shared worker on unmount is a hazard for any second mount, and
// the next one need not come from StrictMode.
//
// Owning the port per mount keeps its lifetime the same as the document's.
function freshWorkerPort() {
  const port = new PdfWorker()
  pdfjs.GlobalWorkerOptions.workerPort = port
  return port
}

function Page({ pdf, pageNumber, quotes, width, onHover, activeId, onPageMatched, ocrPage }) {
  const canvasRef = useRef(null)
  const [boxes, setBoxes] = useState([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  // What the page yielded, kept so a layout that arrives later can be matched
  // without re-rendering the canvas — re-rendering every page of a long scan
  // the moment the OCR layout loads is visible as a flash.
  const [rendered, setRendered] = useState(null)

  useEffect(() => {
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const scale = width / base.width
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      // Render at device resolution, lay out at CSS resolution, so the page is
      // sharp on a retina screen without the overlay coordinates shifting.
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      setSize({ width: viewport.width, height: viewport.height })
      task = page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      })
      try { await task.promise } catch { return }
      if (cancelled) return

      const content = await page.getTextContent()
      if (cancelled) return
      setRendered({ index: pageIndex(content.items), items: content.items, viewport })
    })()
    return () => { cancelled = true; if (task) task.cancel() }
  }, [pdf, pageNumber, width])

  useEffect(() => {
    if (!rendered) return
    const { index, items, viewport } = rendered
    const hasText = index.text.length > 0
    const found = []
    const placed = new Set()

    if (hasText) {
      for (const q of quotes) {
        for (const range of findRanges(index.text, q.quote)) {
          placed.add(q.id)
          for (const r of rangeToRects(range, index, items, viewport)) found.push({ ...r, risk: q })
        }
      }
    } else if (ocrPage?.words?.length) {
      // No text layer: match against the words OCR recorded for this page.
      const oi = ocrIndex(ocrPage.words)
      for (const q of quotes) {
        for (const range of findRanges(oi.text, q.quote)) {
          placed.add(q.id)
          for (const r of ocrRangeToRects(range, oi, ocrPage.words, viewport, ocrPage)) {
            found.push({ ...r, risk: q })
          }
        }
      }
    }
    setBoxes(found)
    // Reported upward so the page can say how many risks it could place, and
    // how it placed them — a scan with no stored layout still cannot be shaded,
    // and saying so is the difference between a limitation and a broken feature.
    onPageMatched?.({ page: pageNumber, placed, hasText, ocrUsed: !hasText && !!ocrPage?.words?.length })
  }, [rendered, quotes, ocrPage, pageNumber, onPageMatched])

  return (
    <div className="pdf-page" style={{ width: size.width || width, height: size.height || undefined }}>
      <canvas ref={canvasRef} style={{ width: size.width || width, height: size.height || 'auto' }} />
      {boxes.map((b, i) => (
        <div key={i}
          className={`pdf-risk-box${activeId === b.risk.id ? ' active' : ''}`}
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
          onMouseEnter={(e) => onHover({ risk: b.risk, x: e.clientX, y: e.clientY })}
          onMouseMove={(e) => onHover({ risk: b.risk, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onHover(null)} />
      ))}
    </div>
  )
}

// The original PDF, rendered by us so the risk findings can be drawn onto it.
//
// The extracted-text view already highlights every located risk, but that is a
// transcription — people want to see the flag on the page they will actually be
// signing. `quotes` are {id, quote, clause_type, reasons}.
//
// `onUnavailable` fires when this renderer cannot run at all. Shading is the
// enhancement; seeing the contract is the point, so the caller falls back to
// the browser's own viewer rather than leaving the reader with an error and no
// document.
export default function PdfRiskOverlay({ url, quotes, activeId, onUnavailable, loadLayout }) {
  const [pdf, setPdf] = useState(null)
  const [error, setError] = useState(null)
  const [width, setWidth] = useState(760)
  const [tip, setTip] = useState(null)
  // Which risks were actually placed, and whether any page had a text layer.
  // Silence about this was the whole problem: a scanned contract renders
  // perfectly and shades nothing, and there was no way to tell that from the
  // feature being broken.
  const [coverage, setCoverage] = useState({ placed: new Set(), textPages: 0, pages: 0, ocrPages: 0 })
  // OCR word boxes, fetched only once a page turns out to have no text layer.
  // null = not asked yet, false = asked and unavailable.
  const [layout, setLayout] = useState(null)
  const asked = useRef(false)
  const wrapRef = useRef(null)

  const onPageMatched = useCallback(({ placed, hasText, ocrUsed }) => {
    setCoverage((prev) => {
      const merged = new Set(prev.placed)
      placed.forEach((id) => merged.add(id))
      return {
        placed: merged,
        textPages: prev.textPages + (hasText ? 1 : 0),
        ocrPages: prev.ocrPages + (ocrUsed ? 1 : 0),
        pages: prev.pages + 1,
      }
    })
    // A page with no text of its own is the only reason to fetch the layout,
    // so a digital contract never pays for a payload it cannot use.
    if (!hasText && !asked.current && loadLayout) {
      asked.current = true
      loadLayout()
        .then((d) => setLayout(d?.available ? d : false))
        .catch(() => setLayout(false))
    }
  }, [loadLayout])

  useEffect(() => {
    setCoverage({ placed: new Set(), textPages: 0, pages: 0, ocrPages: 0 })
    setLayout(null)
    asked.current = false
  }, [url, quotes])

  useEffect(() => {
    let cancelled = false
    let doc = null
    setError(null); setPdf(null)
    const fail = (e) => {
      if (cancelled) return
      const message = e?.message || String(e) || 'Could not read this PDF'
      setError(message)
      onUnavailable?.(message)
    }
    let task
    let port
    try {
      port = freshWorkerPort()
      task = pdfjs.getDocument({ url })
    } catch (e) {
      // Worker construction and document setup both throw synchronously when
      // the worker script cannot be loaded at all.
      fail(e)
      return undefined
    }
    task.promise.then((d) => {
      doc = d
      if (cancelled) d.destroy()
      else setPdf(d)
    }).catch(fail)
    return () => {
      cancelled = true
      if (doc) doc.destroy()
      task.destroy?.()
      // This mount owns the port, so it also ends it. Left running, every
      // visit to a contract would leak a worker thread for the life of the tab.
      port?.terminate?.()
    }
  }, [url, onUnavailable])

  // Fit the page to the pane, and keep fitting it as the pane changes size.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width)
      if (w > 200) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pages = useMemo(() => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []), [pdf])

  // Only meaningful once every page has reported.
  const allReported = coverage.pages === pages.length && pages.length > 0
  const scanned = allReported && coverage.textPages === 0
  // A scan the server captured word boxes for is shaded like any other document;
  // only a scan with no stored layout is genuinely unshadeable.
  const scannedWithoutLayout = scanned && coverage.ocrPages === 0 && layout === false
  const unplaced = allReported ? quotes.filter((q) => !coverage.placed.has(q.id)) : []

  return (
    <div ref={wrapRef} className="pdf-risk-wrap">
      {error && <p className="hint">Falling back to the browser viewer — {error}</p>}
      {!pdf && !error && <p className="hint">Rendering document…</p>}
      {scannedWithoutLayout && quotes.length > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          This PDF is a scan with no recorded word positions, so there is nothing on the page
          to shade. The flags are listed below and shown in place under “Extracted text”,
          which uses the text read by OCR.
        </p>
      )}
      {!scannedWithoutLayout && unplaced.length > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          {unplaced.length} of {quotes.length} flagged clause{quotes.length > 1 ? 's' : ''} could not
          be located on the page ({unplaced.map((q) => q.clause_type).join(', ')}) — the wording in
          the file differs too much from the extracted text. They are listed below.
        </p>
      )}
      {pages.map((n) => (
        <Page key={n} pdf={pdf} pageNumber={n} quotes={quotes} width={width}
          activeId={activeId} onHover={setTip} onPageMatched={onPageMatched}
          ocrPage={layout ? layout.pages?.[n - 1] : undefined} />
      ))}
      {tip && (
        <div className="risk-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 320), top: tip.y + 16 }}>
          <strong>⚠ Not in the company's favour</strong>
          <div className="hint" style={{ color: '#ffd7cf', marginTop: 2 }}>{tip.risk.clause_type}</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {(tip.risk.reasons || []).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
