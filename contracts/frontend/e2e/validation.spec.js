// Validation queue -> register. Dev/CI only (see README.md).
//
// The roadmap asked for "upload a PDF -> validate -> contract appears in the
// register". The upload half cannot be driven here: ingestion hands the
// document to an AI extractor, and there is no provider on an offline box or
// in CI, so the file would sit QUEUED forever. This starts from a seeded
// PENDING_VALIDATION contract instead and covers everything after extraction,
// which is the part with UI in it.
import { expect, test } from '@playwright/test'
import { login, waitForApi } from './helpers.js'

const PENDING_VENDOR = 'E2E Pending Ltd'

test.describe('validation queue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('a pending contract is listed with its extracted fields', async ({ page }) => {
    await page.goto('/validation')
    await waitForApi(page, '/contracts')
    await expect(page.getByText(PENDING_VENDOR).first()).toBeVisible({ timeout: 15_000 })
  })

  test('validating it moves it out of the queue and into the register', async ({ page }) => {
    await page.goto('/validation')
    await waitForApi(page, '/contracts')

    const row = page.locator('tr', { hasText: PENDING_VENDOR }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.locator('input[type=checkbox]').first().check()

    // "Validate complete" skips rows missing a mandatory field, so a silent
    // no-op would look identical to success from the button alone. The
    // assertions below are what distinguish them.
    await page.getByRole('button', { name: 'Validate complete' }).click()

    // Gone from the queue...
    await expect(page.getByText(PENDING_VENDOR)).toHaveCount(0, { timeout: 15_000 })

    // ...and present in the register, which is the half that matters to a user.
    await page.goto('/contracts')
    await waitForApi(page, '/contracts')
    await expect(page.getByText(PENDING_VENDOR).first()).toBeVisible({ timeout: 15_000 })
  })
})
