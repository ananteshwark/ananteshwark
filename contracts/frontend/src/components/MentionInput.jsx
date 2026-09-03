import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'

// A comment box that completes @mentions against the real user list.
//
// The placeholder always said "@name to notify someone" and the server has
// always resolved mentions, but nothing ever told you what the names were: you
// had to know the exact login local-part or first name, and a near miss
// notified nobody and looked identical to a hit. This offers the list.
//
// The match is deliberately the same shape the server uses (services/
// user_notifications.notify_mentions): the local-part of the email or the
// first word of the name, case-insensitively. Offering a completion the server
// would not resolve would be worse than offering none.

let cache = null      // module-level: the directory is small and rarely changes

// Mirrors the server's _MENTION_RE. A token it would not match is a mention
// that silently notifies nobody, so such a candidate is never offered.
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,40}$/

export function mentionToken(user) {
  const local = (user.email || '').split('@')[0]
  if (TOKEN_RE.test(local)) return local
  const first = (user.name || '').split(/\s+/)[0] || ''
  return TOKEN_RE.test(first) ? first : null
}

export async function loadDirectory() {
  if (cache) return cache
  const rows = await api.get('/auth/users-lite')
  cache = (rows || [])
    .map((u) => ({ ...u, token: mentionToken(u) }))
    .filter((u) => u.token)
  return cache
}

export default function MentionInput({
  value, onChange, onSubmit, placeholder, disabled, rows = 0, className = '',
}) {
  const [users, setUsers] = useState([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { loadDirectory().then(setUsers).catch(() => setUsers([])) }, [])

  // The @token being typed, if the caret sits inside one.
  const detect = useCallback((text, caret) => {
    const upto = text.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at < 0) return null
    // Only a token at a word boundary counts, so an email address in the body
    // does not open the picker.
    if (at > 0 && !/\s/.test(upto[at - 1])) return null
    const token = upto.slice(at + 1)
    if (/\s/.test(token)) return null
    return { at, token }
  }, [])

  const matches = useMemo(() => {
    const q = query.toLowerCase()
    const pool = users.filter((u) => !q
      || u.token.toLowerCase().startsWith(q)
      || (u.name || '').toLowerCase().includes(q))
    return pool.slice(0, 8)
  }, [users, query])

  function handleChange(e) {
    const text = e.target.value
    onChange(text)
    const found = detect(text, e.target.selectionStart ?? text.length)
    if (found) { setQuery(found.token); setActive(0); setOpen(true) }
    else setOpen(false)
  }

  function insert(user) {
    const el = inputRef.current
    const caret = el?.selectionStart ?? value.length
    const found = detect(value, caret)
    if (!found) { setOpen(false); return }
    const before = value.slice(0, found.at)
    const after = value.slice(caret)
    const next = `${before}@${user.token} ${after.replace(/^\s+/, '')}`
    onChange(next)
    setOpen(false)
    // Put the caret after the inserted mention rather than at the end, so a
    // mention typed mid-sentence does not send you back to the start.
    const pos = before.length + user.token.length + 2
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos) })
  }

  function handleKeyDown(e) {
    if (open && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(matches[active]); return }
      if (e.key === 'Escape') { setOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit && !rows) { e.preventDefault(); onSubmit() }
  }

  const Field = rows ? 'textarea' : 'input'
  return (
    <div className="mention-wrap">
      <Field
        ref={inputRef}
        className={className}
        rows={rows || undefined}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && matches.length > 0 && (
        <ul className="mention-menu" role="listbox">
          {matches.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => { e.preventDefault(); insert(u) }}
                onMouseEnter={() => setActive(i)}>
              <strong>{u.name}</strong> <span className="hint">@{u.token}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
