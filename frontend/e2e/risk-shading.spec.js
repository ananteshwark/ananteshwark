// Risk shading on the real PDF viewer. Dev/CI only (see README.md).
//
// This is the spec the roadmap called for by name, because this feature has
// broken in production twice in ways no unit test could see:
//
//   * the PDF.js worker was the only .mjs in the build and nginx served it as
//     application/octet-stream, so `nosniff` refused the module import;
//   * the object URL for the document was revoked in the same tick it was
//     handed to the viewer, so the page rendered "It may have been moved,
//     edited, or deleted".
//
// Both needed a real browser fetching real assets over HTTP. Everything below
// the browser was green throughout.
import { expect, test } from '@playwright/test'
import { login, waitForApi } from './helpers.js'

const SR_NO = process.env.E2E_CONTRACT_SR || '1'

test.describe('contract risk shading', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('the original PDF renders and its risky clauses are shaded', async ({ page }) => {
    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')

    await page.getByRole('button', { name: 'Original file' }).click()

    // The page itself renders — this is what the revoked-object-URL bug broke.
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 20_000 })

    // And the flags are drawn on it. Boxes appear only after the text layer is
    // read and every quote is anchored, so this is the whole pipeline:
    // extraction -> segmentation -> risk match -> anchor -> render.
    const boxes = page.locator('.pdf-risk-box')
    await expect(boxes.first()).toBeVisible({ timeout: 20_000 })
    expect(await boxes.count()).toBeGreaterThan(0)
  })

  test('no worker or module-loading error is reported', async ({ page }) => {
    // The .mjs MIME failure surfaced as a message in the UI, not a crash: the
    // viewer fell back to the browser's own and said "Setting up fake worker
    // failed". Asserting the absence of that fallback is what would have
    // caught it.
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')
    await page.getByRole('button', { name: 'Original file' }).click()
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 20_000 })

    await expect(page.getByText(/Falling back to the browser viewer/i)).toHaveCount(0)
    await expect(page.getByText(/fake worker/i)).toHaveCount(0)

    const worker = consoleErrors.filter((t) => /worker|dynamically imported module/i.test(t))
    expect(worker, `worker errors in console: ${worker.join(' | ')}`).toHaveLength(0)
  })

  test('hovering a shaded clause explains why it is flagged', async ({ page }) => {
    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')
    await page.getByRole('button', { name: 'Original file' }).click()
    await expect(page.locator('.pdf-risk-box').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('.pdf-risk-box').first().hover()
    await expect(page.locator('.risk-tip')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.risk-tip')).toContainText(/not in the company/i)
  })

  test('shading still works the second time the viewer is opened', async ({ page }) => {
    // Leaving the viewer and coming back is what a reader does, and it is the
    // only assertion here that exercises a second mount of the overlay — every
    // other test starts from a fresh page where the first mount always works.
    //
    // Honest about its limits: this does NOT catch the shared-worker defect
    // fixed in PdfRiskOverlay. That one reproduced 6 times in 6 under
    // StrictMode's double-mount and 0 times in 6 against a production build,
    // which is what these specs run against. Catching that class needs the
    // dev server; see README.md.
    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')

    await page.getByRole('button', { name: 'Original file' }).click()
    await expect(page.locator('.pdf-risk-box').first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Extracted text' }).click()
    await expect(page.locator('.pdf-page canvas')).toHaveCount(0)

    await page.getByRole('button', { name: 'Original file' }).click()
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.pdf-risk-box').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/browser.s viewer/i)).toHaveCount(0)
  })

  test('no Content-Security-Policy violation is reported', async ({ page }) => {
    // The viewer is the part of the app a CSP is most likely to break: it runs
    // a worker, fetches the document with auth and renders it from an object
    // URL. A policy that blocks any of that should fail here rather than on the
    // deployed box, where the symptom is a blank page.
    const violations = []
    page.on('console', (m) => {
      const t = m.text()
      if (/Content Security Policy|Refused to (load|execute|connect|create)/i.test(t)) {
        violations.push(t)
      }
    })

    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')
    await page.getByRole('button', { name: 'Original file' }).click()
    await expect(page.locator('.pdf-risk-box').first()).toBeVisible({ timeout: 20_000 })

    expect(violations, `CSP violations: ${violations.join(' | ')}`).toHaveLength(0)
  })

  test('the extracted-text view highlights the same clauses', async ({ page }) => {
    // The fallback path for scans and non-PDFs. It has to work, because it is
    // what the viewer points people at when it cannot shade the page itself.
    await page.goto(`/contracts/${SR_NO}`)
    await waitForApi(page, '/clause-risk')
    await page.getByRole('button', { name: 'Extracted text' }).click()
    await expect(page.locator('mark, .risk-hit').first()).toBeVisible({ timeout: 15_000 })
  })
})
