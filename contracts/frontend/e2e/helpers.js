// Shared steps for the browser specs. Dev/CI only (see README.md).
import { expect } from '@playwright/test'

export const EMAIL = process.env.E2E_EMAIL || 'admin@example.com'
export const PASSWORD = process.env.E2E_PASSWORD || 'adminpass123'

// The login form's <label>s are not associated with their inputs (no htmlFor /
// id), and the inputs carry no placeholder, so neither getByLabel nor
// getByPlaceholder can find them — the original specs used getByPlaceholder
// and could never have matched. The input types are unambiguous on this page.
export async function login(page) {
  await page.goto('/')
  await page.locator('input[type=email]').fill(EMAIL)
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  // The app shell only renders once authenticated.
  await expect(page.locator('nav').first()).toBeVisible({ timeout: 15_000 })
}

// Wait for a specific API call the page makes, so assertions run against
// loaded data rather than a spinner.
export function waitForApi(page, pathFragment) {
  return page.waitForResponse(
    (r) => r.url().includes(pathFragment) && r.status() < 400,
    { timeout: 15_000 },
  )
}
