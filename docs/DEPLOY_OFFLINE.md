# Deploying the offline bundle (air-gapped)

If new features aren't visible after a release, the running app is almost always
a **stale deployment**: the old frontend bundle is still being served and/or the
backend wasn't restarted (so its new columns/endpoints aren't live). Both halves
must be updated. The tarball (`cms-offline-<commit>.tar.gz`) contains everything:
`git archive` of the source + prebuilt `frontend/dist` + `frontend/node_modules`.

## 0. Which half is stale? (30-second check on the server)

```bash
# Backend: a NEW endpoint should answer 401/403 (exists, needs auth), not 404.
curl -s -o /dev/null -w "backend clauses/curated -> %{http_code}\n" \
  http://localhost:8000/api/clauses/curated
#   401/403 = backend is up to date   |   404 = backend is STALE (restart it)

# Frontend: the served bundle should mention a new feature string.
ASSET=$(curl -s http://localhost/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "http://localhost/$ASSET" | grep -q "Curated top 5" \
  && echo "frontend is up to date" || echo "frontend bundle is STALE (replace dist)"
```

Adjust ports/host to your setup (backend `:8000`, nginx serving `:80`).

## 1. Stage the release

```bash
tar -xzf cms-offline-<commit>.tar.gz            # -> ./cms-offline
sudo rsync -a --delete cms-offline/backend/      /opt/cms/app/backend/
sudo rsync -a --delete cms-offline/frontend/dist/ /opt/cms/app/frontend/dist/
# node_modules is only needed if you ever rebuild on the box; the served app
# uses frontend/dist, which is already built.
sudo chown -R cms:cms /opt/cms/app
```

## 2. Restart the backend (this runs the additive migrations on boot)

```bash
sudo systemctl restart cms-backend
sudo journalctl -u cms-backend -n 40 --no-pager   # confirm "Migration: added ..." lines, no errors
```

The migrations are additive and idempotent (`ADD COLUMN IF NOT EXISTS` semantics):
they add `contracts.location`, `clause_versions.polished_text/is_curated/
curated_rank`, `esign_envelopes.certificate_path/options`, and
`vendor_share_links.nudged_at`. Existing data is untouched.

## 3. Reload the frontend

The served files are `/opt/cms/app/frontend/dist`. If nginx has a long cache
TTL, reload it and hard-refresh the browser:

```bash
sudo nginx -s reload
```

In the browser: **Ctrl+Shift+R** (or an incognito window) to bypass the cached
`index.html`/assets. Vite fingerprints asset filenames, so a fresh `index.html`
is all that's needed — a cached `index.html` is the usual "I deployed but nothing
changed" cause.

## 4. Verify the nine features

| # | Feature | Where to look |
|---|---------|---------------|
| 1 | **Location** field | Validation screen field; Contracts table "Location" column; duplicate check uses it |
| 2 | **Immediate expiry** | Open a contract past its end date → lifecycle shows `EXPIRED` on load |
| 3 | **Clause text on list** | Clause Library → each row shows a text preview |
| 4/6 | **Curated top-5 + AI polish** | Clause Library → "Curated top 5" toggle and "Curate & polish" button; backfill runs library-wide |
| 7 | **Drag-and-drop clause** | Authoring workspace → Clauses panel → drag a row onto the document |
| 8 | **Undo (last N)** | Authoring workspace toolbar → ↶ Undo / ↷ Redo (also Ctrl+Z) |
| 9 | **DocuSign config** | Settings → "E-signature (DocuSign)" card (provider, keys, JWT) |

If a feature still doesn't show after this, it's an access-role gate, not a
deploy issue: **Curate & polish** and **drag-drop** need an author role
(Admin/Validator/Author/Legal/Approver); **DocuSign config** and **Restricted
authoring fields** need Admin.
