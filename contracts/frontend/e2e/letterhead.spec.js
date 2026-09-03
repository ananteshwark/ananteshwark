// Each business unit's letterhead reaches the authoring editor. Dev/CI only
// (see README.md).
//
// Asserted in a browser because the thing that matters is what the author sees
// on the page: the band has to load (an <img> whose src 401s renders as nothing,
// and the session for it is an HttpOnly cookie the page cannot help with), and
// it has to be *this* BU's band rather than whichever one happens to be first.
import { expect, test } from '@playwright/test'
import { login, waitForApi } from './helpers.js'

// Seeded by backend/scripts/seed_e2e.py, along with a draft in each BU.
const BUS = ['E2E Alpha BU', 'E2E Beta BU']

async function openDraftFor(page, bu) {
  await page.goto('/authoring/drafts')
  await waitForApi(page, '/authoring/drafts')
  await page.getByRole('link', { name: `${bu} draft` }).first().click()
  await expect(page.getByText(/Data fields/i).first()).toBeVisible({ timeout: 15_000 })
}

// The pixel at the middle of the band, read off a canvas — the honest way to
// ask "did this image decode and is it the right one", since two bands of the
// same size are otherwise indistinguishable from the DOM.
async function bandColour(page) {
  const band = page.locator('.doc-letterhead img').first()
  await expect(band).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => band.evaluate((el) => el.naturalWidth), { timeout: 15_000 })
    .toBeGreaterThan(0)
  return band.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = el.naturalWidth
    canvas.height = el.naturalHeight
    canvas.getContext('2d').drawImage(el, 0, 0)
    const [r, g, b] = canvas.getContext('2d').getImageData(
      Math.floor(el.naturalWidth / 2), Math.floor(el.naturalHeight / 2), 1, 1).data
    return `${r},${g},${b}`
  })
}

test.describe('letterheads', () => {
  test('the editor draws the business unit\'s letterhead', async ({ page }) => {
    await login(page)
    await openDraftFor(page, BUS[0])
    await expect(page.locator('.doc-letterhead img').first()).toBeVisible()
  })

  test('a different business unit gets different paper', async ({ page }) => {
    await login(page)
    await openDraftFor(page, BUS[0])
    const alpha = await bandColour(page)
    await openDraftFor(page, BUS[1])
    const beta = await bandColour(page)
    expect(alpha, `both business units drew the same band (${alpha})`).not.toBe(beta)
  })

  test('the letterhead is not part of the document', async ({ page }) => {
    // It sits outside the editable area on purpose: an author must not be able
    // to delete the company's stationery out of a contract, and it must never
    // reach the saved draft.
    await login(page)
    await openDraftFor(page, BUS[0])
    const insideEditor = await page.locator('.ProseMirror img').count()
    expect(insideEditor, 'the letterhead leaked into the editable document').toBe(0)
  })
})
