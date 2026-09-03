import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { confirmDialog } from '../confirm'

// The default letterhead is stored under the empty business unit: it is what a
// draft prints on when its BU is unset, or has no letterhead of its own.
const DEFAULT_BU = ''

function Band({ bu, kind, letterhead, onUpload, onClear, busy }) {
  const input = useRef(null)
  const band = kind === 'header' ? letterhead?.header : letterhead?.footer
  // The image endpoint resolves the BU the same way the exports do, so what is
  // previewed here is the artwork a contract will actually come out on. The
  // cache-buster is what makes a replacement show immediately — the URL is
  // otherwise identical.
  const src = band
    ? `/api/settings/letterhead/image?bu=${encodeURIComponent(bu)}&kind=${kind}&v=${encodeURIComponent(letterhead.updated_at || '')}`
    : null

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label>{kind === 'header' ? 'Header artwork' : 'Footer artwork (optional)'}</label>
      {src ? (
        <div className="letterhead-preview">
          <img src={src} alt={`${kind} letterhead for ${bu || 'the default'}`} />
        </div>
      ) : (
        <p className="hint" style={{ margin: '4px 0 8px' }}>
          {kind === 'header' ? 'None yet — the contract prints on plain paper.' : 'None.'}
        </p>
      )}
      {band && (
        <p className="hint" style={{ margin: '2px 0 6px' }}>
          {band.width}×{band.height}px — prints {band.band_inches}&Prime; tall across the page.
        </p>
      )}
      <div className="toolbar" style={{ margin: 0 }}>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp"
               style={{ display: 'none' }}
               onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(kind, f) }} />
        <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {band ? 'Replace' : 'Upload'}
        </button>
        {kind === 'footer' && band && (
          <button className="secondary" disabled={busy} onClick={() => onClear('footer')}>Remove</button>
        )}
      </div>
    </div>
  )
}

export default function LetterheadSettings({ businessUnits, onSaved, onError }) {
  const [rows, setRows] = useState([])
  const [bu, setBu] = useState(DEFAULT_BU)
  const [busy, setBusy] = useState(false)
  // Bumped to refetch after an upload or a delete. A counter rather than an
  // imperative load() so the fetch lives in the effect, where the stale guard
  // can drop a response that lost a race to a newer one.
  const [reloads, setReloads] = useState(0)
  const reload = useCallback(() => setReloads((n) => n + 1), [])

  useEffect(() => {
    let stale = false
    api.get('/settings/letterheads')
      .then((r) => { if (!stale) setRows(r.letterheads || []) })
      .catch((e) => { if (!stale) onError(e.message) })
    return () => { stale = true }
  }, [reloads, onError])

  const current = rows.find((r) => r.business_unit === bu) || null

  async function upload(kind, file) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // Raw fetch rather than api.post: this is multipart, and the api layer
      // JSON-encodes bodies. The session rides on the cookie; uploadHeaders()
      // supplies the CSRF token the write needs.
      const url = `/api/settings/letterhead?bu=${encodeURIComponent(bu)}&kind=${kind}`
      const res = await fetch(url, {
        method: 'POST', headers: api.uploadHeaders(), credentials: 'same-origin', body: fd,
      })
      if (!res.ok) {
        let detail = res.statusText
        try { detail = (await res.json()).detail || detail } catch { /* not json */ }
        throw new Error(detail)
      }
      reload()
      onSaved(`Letterhead saved for ${bu || 'all other business units'}`)
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  async function clear(kind) {
    const what = kind === 'all'
      ? `Delete the whole letterhead for ${bu || 'the default'}?`
      : 'Remove the footer artwork?'
    if (!await confirmDialog(what)) return
    setBusy(true)
    try {
      await api.del(`/settings/letterhead?bu=${encodeURIComponent(bu)}&kind=${kind}`)
      reload()
      onSaved('Letterhead updated')
    } catch (e) { onError(e.message) } finally { setBusy(false) }
  }

  // Every BU that could have one, plus any letterhead whose BU has since been
  // removed from the master list — those still apply to existing drafts, so
  // hiding them would hide a letterhead that is still in use.
  const orphans = rows
    .map((r) => r.business_unit)
    .filter((name) => name && !businessUnits.includes(name))
  const options = [DEFAULT_BU, ...businessUnits, ...orphans]
  const configured = new Set(rows.map((r) => r.business_unit))

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Each business unit prints its contracts on its own letterhead — in the authoring
        editor, in the Word and PDF exports, in the copy shared with the vendor, and on the
        document sent for signature. A draft with no business unit of its own falls back to
        the default. Artwork should be a full-width banner (PNG or JPEG, around 1600px wide);
        it is scaled to the paper&apos;s width and the body text starts below it.
      </p>

      <div className="toolbar" style={{ margin: '0 0 10px' }}>
        <label htmlFor="lh-bu" style={{ margin: 0 }}>Business unit</label>
        <select id="lh-bu" value={bu} onChange={(e) => setBu(e.target.value)} style={{ maxWidth: 280 }}>
          {options.map((name) => (
            <option key={name || '__default__'} value={name}>
              {name || 'Default (all other business units)'}
              {configured.has(name) ? ' ✓' : ''}
              {name && orphans.includes(name) ? ' — not in the BU list' : ''}
            </option>
          ))}
        </select>
        <span className="spacer" />
        {current && (
          <button className="danger" disabled={busy} onClick={() => clear('all')}>
            Delete this letterhead
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Band bu={bu} kind="header" letterhead={current} onUpload={upload} onClear={clear} busy={busy} />
        <Band bu={bu} kind="footer" letterhead={current} onUpload={upload} onClear={clear} busy={busy} />
      </div>

      {current && (
        <p className="hint" style={{ marginBottom: 0 }}>
          Leaves {current.text_height_inches}&Prime; of page for the contract text.
        </p>
      )}
      {options.length === 1 && (
        <p className="hint">
          Add your business units above to give each one its own letterhead.
        </p>
      )}
    </div>
  )
}
