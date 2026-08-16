// Accessible, promise-based confirm dialog. Call `await confirmDialog(message)`
// anywhere (no hook needed); a single ConfirmHost renders the modal and resolves
// true/false. Replaces the native, inaccessible window.confirm().
export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    try {
      window.dispatchEvent(new CustomEvent('cms:confirm', { detail: { message, opts, resolve } }))
    } catch {
      resolve(window.confirm(message))   // SSR / no window fallback
    }
  })
}

// Accessible replacement for window.prompt(). Resolves the entered string, or
// null if cancelled.
export function promptDialog(message, opts = {}) {
  return new Promise((resolve) => {
    try {
      window.dispatchEvent(new CustomEvent('cms:confirm', {
        detail: { message, opts: { ...opts, prompt: true }, resolve },
      }))
    } catch {
      resolve(window.prompt(message, opts.default || ''))
    }
  })
}
