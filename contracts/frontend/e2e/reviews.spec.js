// Send one draft to two reviewers, and check each sees only their own review.
// Dev/CI only (see README.md).
//
// Two things reported from the deployed system meet here:
//   * "I should be able to send multiple reviews, currently its not allowing
//     me to send more than 1 review"
//   * "the users should only see the reviews requested by them or they need to
//     review"
//
// The second is a confidentiality property, and the only way to test it
// honestly is with two real sessions — one reviewer's browser must not be able
// to see the other's thread. Separate contexts, not separate tabs, so the
// session cookies really are different.
import { expect, test } from '@playwright/test'
import { EMAIL, PASSWORD, login, waitForApi } from './helpers.js'

const REVIEWERS = {
  'e2e-reviewer-one@example.com': 'E2E Reviewer One',
  'e2e-reviewer-two@example.com': 'E2E Reviewer Two',
}
const [REVIEWER_ONE, REVIEWER_TWO] = Object.keys(REVIEWERS)

async function loginAs(context, email) {
  const page = await context.newPage()
  await page.goto('/')
  await page.locator('input[type=email]').fill(email)
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.locator('nav').first()).toBeVisible({ timeout: 15_000 })
  return page
}

// Author a draft with one clause and return its id.
async function newDraftWithClause(page) {
  await page.goto('/authoring/new')
  await page.getByRole('button', { name: /start blank draft/i }).click()
  await expect(page.getByText(/Data fields/i).first()).toBeVisible({ timeout: 15_000 })
  const id = new URL(page.url()).pathname.split('/').pop()
  expect(id, `could not read a draft id from ${page.url()}`).toMatch(/^\d+$/)
  return id
}

test.describe('internal review', () => {
  test('one draft can be sent to two reviewers at once', async ({ page }) => {
    await login(page)
    const draftId = await newDraftWithClause(page)

    await page.getByRole('button', { name: 'Send for review' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Both reviewers in one send — the thing that used to be limited to one.
    await dialog.getByText('E2E Reviewer One').click()
    await dialog.getByText('E2E Reviewer Two').click()
    await expect(dialog.getByRole('button', { name: /Send to 2 reviewer/ })).toBeEnabled()
    await dialog.getByRole('button', { name: /Send to 2 reviewer/ }).click()

    await expect(dialog).toHaveCount(0, { timeout: 15_000 })

    // The author sees both requests against the draft.
    const requests = await page.evaluate(async (id) => {
      // The session is an HttpOnly cookie now, so there is no token to read —
      // same-origin credentials is all this needs.
      const r = await fetch(`/api/authoring/drafts/${id}/review-requests`,
                            { credentials: 'same-origin' })
      return r.json()
    }, draftId)
    const names = (requests.requests || []).map((x) => x.reviewer_name || x.reviewer_email || '')
    expect(names.length, JSON.stringify(requests)).toBeGreaterThanOrEqual(2)
  })

  test('each reviewer sees their own review and not the other one', async ({ browser }) => {
    // Author sends to both.
    const authorCtx = await browser.newContext()
    const author = await loginAs(authorCtx, EMAIL)
    const draftId = await newDraftWithClause(author)
    await author.getByRole('button', { name: 'Send for review' }).click()
    const dialog = author.getByRole('dialog')
    await dialog.getByText('E2E Reviewer One').click()
    await dialog.getByText('E2E Reviewer Two').click()
    await dialog.getByRole('button', { name: /Send to 2 reviewer/ }).click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })

    // Each reviewer's own session. my-reviews is the endpoint the page is
    // built from, so asserting on it asserts what the reviewer can see.
    const seenBy = {}
    for (const email of [REVIEWER_ONE, REVIEWER_TWO]) {
      const ctx = await browser.newContext()
      const page = await loginAs(ctx, email)
      await page.goto('/reviews')
      await waitForApi(page, '/my-reviews')
      const mine = await page.evaluate(async () => {
        const r = await fetch('/api/authoring/my-reviews', { credentials: 'same-origin' })
        return r.json()
      })
      const rows = mine.as_reviewer || []
      seenBy[email] = rows.filter((x) => String(x.draft_id) === String(draftId))
      await ctx.close()
    }

    // Both were asked, so both must see exactly their own request for this
    // draft — one each, never the other's.
    for (const email of [REVIEWER_ONE, REVIEWER_TWO]) {
      const rows = seenBy[email]
      expect(rows.length, `${email} saw ${rows.length} requests for draft ${draftId}`).toBe(1)
      // ...and it is theirs, not the other reviewer's.
      const reviewer = String(rows[0].reviewer_name || rows[0].reviewer_email || '')
      expect(reviewer).toBe(REVIEWERS[email])
    }

    await authorCtx.close()
  })
})
