import { useEffect, useRef, useState } from 'react'

// Renders the accessible confirm dialog requested via confirmDialog(). Focus is
// moved to the confirm button on open and returned to the trigger on close;
// Escape cancels, Enter confirms.
export default function ConfirmHost() {
  const [req, setReq] = useState(null)   // { message, opts, resolve }
  const [text, setText] = useState('')
  const btnRef = useRef(null)
  const inputRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    const onConfirm = (e) => {
      triggerRef.current = document.activeElement
      setText(e.detail.opts?.default || '')
      setReq(e.detail)
    }
    window.addEventListener('cms:confirm', onConfirm)
    return () => window.removeEventListener('cms:confirm', onConfirm)
  }, [])

  useEffect(() => {
    if (!req) return
    const el = req.opts?.prompt ? inputRef.current : btnRef.current
    if (el) el.focus()
  }, [req])

  if (!req) return null
  const { message, opts, resolve } = req
  const isPrompt = !!opts.prompt
  const finish = (ok) => {
    setReq(null)
    resolve(isPrompt ? (ok ? text : null) : ok)
    if (triggerRef.current && triggerRef.current.focus) setTimeout(() => triggerRef.current.focus(), 0)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false) }
    if (e.key === 'Enter' && !isPrompt) { e.preventDefault(); finish(true) }
  }

  return (
    <div className="modal-backdrop" onClick={() => finish(false)} onKeyDown={onKey}>
      <div className="modal" role={isPrompt ? 'dialog' : 'alertdialog'} aria-modal="true" aria-label={opts.title || 'Confirm'}
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        {opts.title && <h3 style={{ marginTop: 0 }}>{opts.title}</h3>}
        <p style={{ marginTop: opts.title ? 0 : 4 }}>{message}</p>
        {isPrompt && (
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={opts.placeholder || ''}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true) } }} />
        )}
        <div className="toolbar" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="secondary" onClick={() => finish(false)}>{opts.cancelLabel || 'Cancel'}</button>
          <button ref={btnRef} className={opts.danger ? 'danger' : ''}
            disabled={isPrompt && opts.required && !text.trim()} onClick={() => finish(true)}>
            {opts.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
