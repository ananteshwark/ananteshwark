import { useEffect, useState } from 'react'

// Listens for `cms:toast` events (emitted by the api layer and callers) and
// shows transient, dismissible toasts. Deduplicates identical rapid messages.
export default function ToastHost() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    let seq = 0
    const onToast = (e) => {
      const { kind = 'info', message } = e.detail || {}
      if (!message) return
      setToasts((cur) => {
        if (cur.some((t) => t.message === message)) return cur  // dedupe
        const id = ++seq
        setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 6000)
        return [...cur, { id, kind, message }]
      })
    }
    window.addEventListener('cms:toast', onToast)
    return () => window.removeEventListener('cms:toast', onToast)
  }, [])

  if (toasts.length === 0) return null
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.message}</span>
          <button aria-label="Dismiss" onClick={() => setToasts((c) => c.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
