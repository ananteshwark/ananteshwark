# Browser E2E (dev/CI only)

These Playwright specs drive the app in a real browser. They are **not** part of
the offline/air-gapped bundle — running them needs `@playwright/test` and a
Chromium build.

The dependency-free end-to-end coverage that always runs is the API-level
lifecycle test at `backend/tests/test_e2e_workflow.py` (author → clause → share
→ vendor inline suggestion → disposition → signature → executed contract). These
browser specs cover what only a real browser can see.

## Why they run against the built bundle, not the dev server

Both production failures this feature has had were **build artefacts**:

- the PDF.js worker was emitted as the only `.mjs` in `dist`, and nginx's stock
  `mime.types` has no entry for that extension, so `nosniff` refused the module
  import;
- the object URL for the document was revoked in the same tick it was handed to
  the viewer.

Neither reproduces on the dev server. So the specs point at `vite preview`,
which serves `dist/` exactly as it ships.

The reverse is also true and worth knowing: React's StrictMode double-mounts
effects **in development only**, and that is what exposed the shared-pdf.js-worker
defect (6 failures in 6 runs on the dev server, 0 in 6 against the built
bundle). If you are changing component lifecycle, run the specs against
`BASE_URL=http://localhost:5173` too.

## Running

```bash
# 1. Seed a throwaway database — creates the login, a contract whose PDF is
#    really on disk, and text that really matches it, so risk shading has
#    something to anchor to. Safe to re-run; prints the ids as JSON.
cd backend
DATABASE_URL=sqlite:////tmp/e2e.db JWT_SECRET=$(openssl rand -hex 32) \
  ENV=development CMS_BACKGROUND_SERVICES=false python scripts/seed_e2e.py

# 2. Backend against that same database.
DATABASE_URL=sqlite:////tmp/e2e.db JWT_SECRET=$(openssl rand -hex 32) \
  ENV=development CMS_BACKGROUND_SERVICES=false \
  python -m uvicorn app.main:app --port 8000 &

# 3. Build and serve the frontend. `vite preview` proxies /api to :8000.
cd ../frontend
npm run build
npx vite preview --port 4173 &

# 4. Run the specs.
npm i -D @playwright/test          # needs network
npx playwright install chromium    # or use a pre-provisioned browser
BASE_URL=http://localhost:4173 npx playwright test -c e2e/playwright.config.js
```

On this managed environment Chromium is pre-installed, so skip
`playwright install` and point at it directly:

```bash
BASE_URL=http://localhost:4173 \
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium \
npx playwright test -c e2e/playwright.config.js
```

`E2E_EMAIL` / `E2E_PASSWORD` override the seeded login; `E2E_CONTRACT_SR`
overrides which contract the risk specs open (the seed prints it).

## Notes on selectors

The login form's `<label>`s are not associated with their inputs and the inputs
have no placeholder, so neither `getByLabel` nor `getByPlaceholder` can find
them — the original specs used `getByPlaceholder` and had never been run. The
shared `login()` in `helpers.js` uses the input types instead. Associating the
labels would be a genuine accessibility improvement and would let the specs use
`getByLabel`.
