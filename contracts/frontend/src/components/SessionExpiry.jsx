import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'

// Warn this long before the token's exp so the user can save and re-auth.
const WARN_BEFORE_MS = 5 * 60 * 1000

// When the session runs out, in ms epoch, or null if there isn't one.
//
// This used to decode the JWT out of localStorage. The token is now an
// HttpOnly cookie, so script cannot read it at all — that is the entire point
// of the change. The server therefore publishes the expiry separately in a
// readable cookie: it mirrors the token's own `exp`, carries no authority, and
// the server never reads it back. Forging it wins nothing; the session still
// ends when the signed token says it does.
function tokenExpiryMs() {
  const hit = document.cookie.split('; ').find((c) => c.startsWith('cms_session_exp='))
  if (!hit) return null
  const seconds = Number(hit.slice('cms_session_exp='.length))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null
}

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Watches the signed-in JWT and, five minutes before it expires, shows a sticky
 * banner with a live countdown so an in-progress edit is never lost to a silent
 * 401. On actual expiry it signs the user out cleanly with an explanation
 * instead of an abrupt redirect.
 */
export default function SessionExpiry() {
  const { user, logout } = useAuth()
  const [msLeft, setMsLeft] = useState(null)  // non-null => banner is visible
  const [expired, setExpired] = useState(false)
  const tick = useRef(null)

  const evaluate = useCallback(() => {
    const exp = tokenExpiryMs()
    if (exp == null) { setMsLeft(null); setExpired(false); return }
    const remaining = exp - Date.now()
    if (remaining <= 0) { setExpired(true); setMsLeft(0); return }
    setExpired(false)
    setMsLeft(remaining <= WARN_BEFORE_MS ? remaining : null)
  }, [])

  // Re-evaluate on login/logout and when another tab changes the token.
  useEffect(() => {
    evaluate()
    const onAuth = () => evaluate()
    window.addEventListener('cms:auth', onAuth)
    window.addEventListener('storage', onAuth)
    return () => {
      window.removeEventListener('cms:auth', onAuth)
      window.removeEventListener('storage', onAuth)
    }
  }, [evaluate, user])

  // A once-a-second tick keeps the countdown live and flips the banner on as the
  // warn window opens, without a burst of timers.
  useEffect(() => {
    if (!user) return
    tick.current = setInterval(evaluate, 1000)
    return () => clearInterval(tick.current)
  }, [user, evaluate])

  if (!user) return null

  if (expired) {
    return (
      <div className="session-banner expired" role="alert">
        <span>Your session has expired. Please sign in again — any unsaved changes on this page won’t be kept.</span>
        <button onClick={logout}>Sign in again</button>
      </div>
    )
  }

  if (msLeft == null) return null

  return (
    <div className="session-banner" role="alert" aria-live="assertive">
      <span>
        ⚠ Your session expires in <strong>{fmt(msLeft)}</strong>. Save your work, then sign in again to continue.
      </span>
      <button onClick={logout}>Sign in again now</button>
    </div>
  )
}
