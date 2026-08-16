# Browser E2E (dev/CI only)

These Playwright specs drive the app in a real browser. They are **not** part of
the offline/air-gapped bundle and are not installed by default — running them
needs network access to fetch `@playwright/test` (or a pre-provisioned browser).

The dependency-free end-to-end coverage that always runs is the API-level
lifecycle test at `backend/tests/test_e2e_workflow.py` (author → clause → share →
vendor inline suggestion → disposition → signature → executed contract). Use
these browser specs for UI-level smoke coverage in a networked environment.

## Running (networked dev/CI)

```bash
# 1. Start the backend (SQLite dev DB) and the frontend dev server (vite proxy):
(cd backend && uvicorn app.main:app --port 8000 &)
(cd frontend && npm run dev &)          # serves :5173, proxies /api -> :8000

# 2. Install Playwright + a browser (needs network), then run:
cd frontend
npm i -D @playwright/test
npx playwright install chromium
BASE_URL=http://localhost:5173 npx playwright test
```

On this managed environment Chromium is pre-installed under
`/opt/pw-browsers`; point Playwright at it with
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and skip `playwright install`.

Set `E2E_EMAIL` / `E2E_PASSWORD` to a seeded admin login.
