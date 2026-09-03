const BASE = '/api'

// The session is an HttpOnly cookie the browser attaches for us — deliberately
// unreadable from here, which is the point. What we do have to send is the
// CSRF token: the server sets it in a readable cookie, and echoing it in a
// header proves the request came from a page on this origin. A cross-site page
// can make the browser send the session cookie, but cannot read one.
function csrfToken() {
  const hit = document.cookie.split('; ').find((c) => c.startsWith('cms_csrf='))
  return hit ? decodeURIComponent(hit.slice('cms_csrf='.length)) : null
}

// Global error channel: the api layer emits these so a ToastHost can surface
// failures even when a component swallows the rejection (.catch(() => {})).
export function notifyError(message) {
  try { window.dispatchEvent(new CustomEvent('cms:toast', { detail: { kind: 'error', message } })) }
  catch { /* SSR / no window */ }
}
export function notify(message, kind = 'info') {
  try { window.dispatchEvent(new CustomEvent('cms:toast', { detail: { kind, message } })) }
  catch { /* no window */ }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(options.body)
  }
  const csrf = csrfToken()
  if (csrf) headers['X-CSRF-Token'] = csrf
  let res
  try {
    // same-origin so the session cookie rides along; nginx serves the SPA and
    // proxies /api from the same origin, so nothing cross-site is involved.
    res = await fetch(BASE + path, { ...options, headers, credentials: 'same-origin' })
  } catch (netErr) {
    // Network/connection failure — surface globally so a page can't silently
    // render half-empty when the server is unreachable.
    notifyError(`Can't reach the server — check your connection. (${path})`)
    throw netErr
  }
  // The session slides: once it is past halfway through its life the server
  // renews it. For a cookie session that happens in a Set-Cookie we never see,
  // which is why there is nothing to do here — the sliding is invisible on
  // purpose. Nothing schedules it either; it rides on requests the app was
  // making anyway, so an idle tab lets its session lapse.
  if (res.status === 401) {
    // The session cookie is HttpOnly, so it cannot be cleared from here — only
    // the cached user profile can. The cookie is already invalid or the server
    // would not have said 401.
    localStorage.removeItem('cms_user')
    if (!path.startsWith('/auth/login')) window.location.href = '/login'
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch { /* not json */ }
    // Server-side faults (5xx) are never "expected" — surface them globally even
    // when the caller swallows the error. 4xx are usually handled in-context.
    if (res.status >= 500) notifyError(`${detail || 'Server error'} (${path})`)
    throw new Error(detail)
  }
  const type = res.headers.get('content-type') || ''
  if (type.includes('application/json')) return res.json()
  return res
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  async download(path, filename) {
    const res = await request(path)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  fileUrl(path) {
    return BASE + path
  },
  // Fetch a protected file (sends the auth header) and return an object URL +
  // its content type, for inline preview. Caller must revoke the URL.
  async blobUrl(path) {
    const res = await request(path)
    const contentType = res.headers.get('content-type') || ''
    const blob = await res.blob()
    return { url: URL.createObjectURL(blob), contentType }
  },
  // For the few raw-fetch uploads that post FormData themselves. The session
  // rides on the cookie, so all they need from us is the CSRF token — and they
  // must pass `credentials: 'same-origin'` so the cookie is sent at all.
  uploadHeaders() {
    const csrf = csrfToken()
    return csrf ? { 'X-CSRF-Token': csrf } : {}
  },
}
