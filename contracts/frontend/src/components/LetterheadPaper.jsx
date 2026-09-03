import { useEffect, useState } from 'react'
import { api } from '../api'

/**
 * Wraps the document surface in the business unit's letterhead, so the author
 * drafts on the paper the contract will actually print on.
 *
 * The bands are rendered outside the editable area on purpose: they are not
 * part of the document, so an author cannot delete or edit them, they never
 * enter the saved draft JSON, and clause extraction never sees them. The
 * artwork reaches the exports from the server, not from here — this is the
 * preview of that, not the source of it.
 */
export default function LetterheadPaper({ businessUnit, children }) {
  const [letterhead, setLetterhead] = useState(null)

  useEffect(() => {
    // Resolved server-side, the same way the exports resolve it — including the
    // fallback to the default letterhead — so what is shown here cannot
    // disagree with what comes out of the printer.
    let stale = false
    const bu = encodeURIComponent(businessUnit || '')
    api.get(`/settings/letterhead?bu=${bu}`)
      .then((r) => { if (!stale) setLetterhead(r || null) })
      .catch(() => { if (!stale) setLetterhead(null) })
    return () => { stale = true }
  }, [businessUnit])

  // The image endpoint is same-origin, so the browser attaches the session
  // cookie to these <img> requests on its own — nothing to authenticate here.
  // `v` busts the cache when an admin replaces the artwork; the URL is
  // otherwise identical from one version to the next.
  const url = (kind) => `/api/settings/letterhead/image?bu=${encodeURIComponent(businessUnit || '')}`
    + `&kind=${kind}&v=${encodeURIComponent(letterhead?.updated_at || '')}`

  const label = letterhead?.is_default
    ? 'Default letterhead'
    : `${letterhead?.business_unit} letterhead`

  return (
    <>
      {letterhead && (
        <div className="doc-letterhead" title={label}>
          <img src={url('header')} alt={label} />
        </div>
      )}
      {children}
      {letterhead?.footer && (
        <div className="doc-letterhead foot" title={label}>
          <img src={url('footer')} alt="" />
        </div>
      )}
    </>
  )
}
