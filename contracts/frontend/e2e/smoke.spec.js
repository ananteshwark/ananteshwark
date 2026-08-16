// Browser smoke: log in and author a draft. Dev/CI only (see README.md).
import { expect, test } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL || 'admin@example.com'
const PASSWORD = process.env.E2E_PASSWORD || 'adminpass123'

test('login and reach the dashboard', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/email/i).fill(EMAIL)
  await page.getByPlaceholder(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click()
  // The app shell (nav) renders after auth.
  await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10_000 })
})

test('author a new draft opens the workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/email/i).fill(EMAIL)
  await page.getByPlaceholder(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click()
  await page.goto('/authoring/new')
  await page.getByRole('button', { name: /start blank draft/i }).click()
  // Lands in the workspace with the two-pane editor.
  await expect(page.getByText(/Data fields/i)).toBeVisible({ timeout: 10_000 })
})
