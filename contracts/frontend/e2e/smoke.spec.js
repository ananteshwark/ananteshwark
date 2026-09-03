// Browser smoke: log in and author a draft. Dev/CI only (see README.md).
import { expect, test } from '@playwright/test'
import { login } from './helpers.js'

test('login and reach the dashboard', async ({ page }) => {
  await login(page)
  await expect(page.locator('nav').first()).toBeVisible()
})

test('the session token is not reachable from page script', async ({ page }) => {
  // The reason the session moved out of localStorage. Asserted in a real
  // browser because that is the only place the HttpOnly flag actually means
  // anything — the server can set it and a unit test can read the header, but
  // only the browser enforces it.
  await login(page)

  const visible = await page.evaluate(() => ({
    localStorage: Object.keys(localStorage),
    // document.cookie exposes every non-HttpOnly cookie on the origin.
    cookies: document.cookie,
  }))

  expect(visible.localStorage, 'a token is still cached in localStorage')
    .not.toContain('cms_token')
  expect(visible.cookies, 'the session cookie is readable from script')
    .not.toContain('cms_session=')

  // The two that are supposed to be readable still are, or the CSRF scheme and
  // the expiry warning would be broken.
  expect(visible.cookies).toContain('cms_csrf=')
  expect(visible.cookies).toContain('cms_session_exp=')
})

test('signing out ends the session server-side', async ({ page }) => {
  await login(page)
  await page.evaluate(() => fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-CSRF-Token': (document.cookie.split('; ').find((c) => c.startsWith('cms_csrf=')) || '')
        .slice('cms_csrf='.length),
    },
  }))
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' })
    return r.status
  })
  expect(status).toBe(401)
})

test('author a new draft opens the workspace', async ({ page }) => {
  await login(page)
  await page.goto('/authoring/new')
  await page.getByRole('button', { name: /start blank draft/i }).click()
  // Lands in the workspace with the two-pane editor.
  await expect(page.getByText(/Data fields/i).first()).toBeVisible({ timeout: 15_000 })
})
