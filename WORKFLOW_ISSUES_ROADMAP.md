# Logical Workflow Audit — Issues & Fix Roadmap

> **Scope**: end-to-end business-flow audit of `apps/api` (auth, RBAC, workflow engine,
> finance, procurement, sales, HR/payroll, inventory). Every finding was verified by
> reading the actual code, with `file:line` references.
> **Date**: 2026-07-02 · Baseline: 923 tests passing.

---

## What is already SOLID (verified — no action needed)

| Flow | Evidence |
|------|----------|
| GL journal balance validation | `finance/gl/gl.service.ts:392+` — per-line debit XOR credit, non-zero, totals must balance |
| GRN over-receipt guard | `procurement/grn/grn.service.ts:68-72` — receipt qty capped at PO remaining |
| AP 3-way match with tolerance policy | `vendor-invoice.service.ts:252-298` — inside tolerance auto-matches, outside blocks |
| Stock issue: negative guard + FIFO/std/avg costing | `inventory/inventory.service.ts` `issueStock` |
| Leave apply: balance + overlap conflict check | `hr/leave/leave.service.ts` `applyLeave` |
| Expense claim state machine | `expenses.service.ts:163` — transition-from-status guard; pay requires APPROVED |
| Payroll process guard + transactional payslip rebuild | `payroll/runs/run.service.ts` `processRun` |
| Draft-guards on RFQ / SES / sourcing / campaign edits | only DRAFT/non-SENT records editable |

---

## CRITICAL — security / integrity holes (fix first)

### C1 · Approval workflow engine authorizes nobody
`workflow/workflow.service.ts:69-140` (`approveStep`, `rejectStep`)
- The step's `approvers` list is loaded but **never checked** against the acting user —
  anyone with `workflow:instances:approve` approves any step.
- **Self-approval**: `initiatorId` is stored (line 46-58) but never compared to the
  approver — an employee can approve their own leave / expense / PO workflow.
- **No tenant scoping**: `findOne({ where: { id: instanceId } })` (line 75) — a user in
  tenant A can approve/reject instances in tenant B by ID.
- *Failure*: employee starts a PO-approval workflow, then `POST .../steps/step1/approve`
  themselves → PO approved with zero oversight.

### C2 · RBAC roles: cross-tenant leak + unscoped mutations
`rbac/rbac.service.ts:50, 56, 62, 68`
- `findAll` (50): `role.tenantId = :tenantId OR role.isSystemRole = true`. System roles
  are seeded **per tenant** with `isSystemRole=true`, so every tenant sees every other
  tenant's system-role rows and IDs.
- `findById` / `update` / `delete` (56-68) key **by id only** — no `tenantId`, no
  `isSystemRole` guard. A tenant admin can fetch, rename, re-permission, or delete
  another tenant's roles, including system roles (`Tenant Admin`).
- *Failure*: admin of tenant B calls `DELETE /rbac/roles/:id` with tenant A's admin-role
  ID → tenant A users lose access.

### C3 · Password reset is a stub that reports success
`auth/auth.service.ts` `forgotPassword` / `resetPassword` — both return canned success
messages and **never touch the DB**; `resetPassword` says "Password reset successful"
while changing nothing. The UI exposes `/forgot-password` (`auth.controller.ts:44,51`).
- *Failure*: user forgets password, follows the flow, is told it succeeded, still cannot
  log in — and there is no real reset path, so the account is effectively locked out.

---

## HIGH — data corruption / money-affecting logic

### H1 · Document numbers via `count()+1` — race + gaps + collisions
~25 services build human IDs from `count()` then pad, e.g.
`sourcing.service.ts:43`, `cto.service.ts:116,155`, `cpq.service.ts:106,206`,
`lockbox.service.ts:345`, `wht.service.ts:180`, `controlling.service.ts:227`,
`logistics.service.ts:183`, `inventory-org.service.ts:196`, `service-desk.service.ts:86`,
`picklist.service.ts:93`.
- Two concurrent creates read the same count → **duplicate numbers**; a deleted row →
  reused number. No unique constraint backs most of these.
- *Failure*: two users create a sourcing event at once → both `EVT-000004`; downstream
  lookups by number are ambiguous.

### H2 · Payroll run has no duplicate-period guard
`payroll/runs/run.service.ts:67` `createRun` — nothing prevents a second REGULAR run for
the same `(tenantId, payPeriodMonth, payPeriodYear)`.
- *Failure*: two "July 2026" runs both processed and paid → employees double-paid, GL
  double-posted.

### H3 · Sales `shipOrder` never decrements inventory
`sales/sales.service.ts:189-219` updates `qtyShipped`/status only. `confirmOrder`
(159-188) does an "additive, non-blocking" stock commit but shipping never issues stock.
- *Failure*: order ships, on-hand quantity is unchanged → oversell; inventory and COGS
  are wrong.

### H4 · Leave balance check and deduction are decoupled (TOCTOU)
`leave.service.ts` — `applyLeave` checks available balance; `approveLeave` deducts
`balance.taken` but does **not** re-check availability.
- *Failure*: employee with 2 days left files two 2-day requests (both pass the apply
  check); manager approves both → `taken` exceeds entitlement, balance goes negative.

### H5 · Refresh token ignores account status
`auth.service.ts` `refreshToken` — only `if (!user)`; never checks `status` (LOCKED /
disabled) before minting new tokens.
- *Failure*: an account locked for 5 failed logins (or disabled by admin) keeps a live
  session indefinitely by refreshing.

---

## MEDIUM — hardening / correctness

- **M1 · JWT trusts `isSuperAdmin` from the token payload** (`auth.service.ts`
  `generateTokens`). Revoking super-admin in the DB has no effect until the token
  expires. Resolve `isSuperAdmin` from DB in the guard, or keep access-token TTL short.
- **M2 · No production migration story.** `config/database.config.ts:30`
  `synchronize = APP_ENV==='development'` is correctly gated, but there are **no
  migrations**, so non-dev environments have no schema-management path.
- **M3 · Account lockout has no unlock path** (`auth.service.ts` `validateUser` locks at
  5 failures; nothing resets `failedLoginAttempts` except a *successful* login, which a
  locked user can't do). Add admin unlock or time-based reset.
- **M4 · Admin/tenant lookups by id only** (`admin.service.ts:46,83,90`,
  `tenants.service.ts:32`) — acceptable **only** because these sit behind
  `SuperAdminGuard`; confirm every caller is super-admin-gated and add a test.

---

# ROADMAP

Ordered by risk-reduction per unit effort. Each phase is independently shippable and
test-backed.

### Phase 1 — Authorization correctness (CRITICAL, ~2–3 days)
1. **Workflow approver enforcement** (C1): in `approveStep`/`rejectStep`, scope the
   `findOne` by `tenantId`; resolve the step's `approvers` (role / named-user /
   `direct_manager`) and reject if the acting user isn't among them; block
   `userId === instance.initiatorId` unless the step explicitly allows self-approval.
   Add tests: self-approval blocked, wrong-approver blocked, cross-tenant 404.
2. **RBAC tenant scoping** (C2): add `tenantId` to `findById`/`update`/`delete`; forbid
   mutating/deleting `isSystemRole` rows; change `findAll` so system roles are returned
   as a shared catalog **without** exposing per-tenant duplicates (either seed one shared
   system-role set, or filter by the caller's tenant). Tests for cross-tenant denial.
3. **Password reset** (C3): implement token issue+store (Redis/DB) and
   `resetPassword` that verifies the token and updates `passwordHash`; OR, if out of
   scope now, **hide the forgot-password UI** and have the endpoints return `501` so the
   flow isn't silently lying. Pick one before release.

### Phase 2 — Money & inventory integrity (HIGH, ~3–4 days)
4. **Atomic document numbering** (H1): replace `count()+1` with a per-tenant sequence
   table (or `INSERT ... RETURNING` on a counter row inside the same transaction), and
   add unique constraints on the generated number columns. Roll out service-by-service;
   start with finance/procurement/sales.
5. **Payroll duplicate-period guard** (H2): unique index on
   `(tenantId, payPeriodYear, payPeriodMonth, runType)` + a pre-create check throwing
   `ConflictException`.
6. **Ship decrements stock** (H3): in `shipOrder`, call `inventory.issueStock` per line
   inside a transaction; fail the ship if stock is insufficient (or make the confirm-time
   commitment authoritative and relieve it here). Add an integration test asserting
   on-hand drops.
7. **Leave deduction re-check** (H4): in `approveLeave`, recompute availability and
   reject if `taken + days > entitlement`; wrap check+deduct in a transaction with a row
   lock on the balance.

### Phase 3 — Session & platform hardening (MEDIUM, ~2 days)
8. **Refresh honors status** (H5) + **DB-resolved super-admin** (M1): reject refresh for
   non-ACTIVE users; look up `isSuperAdmin` in `RbacGuard`/`SuperAdminGuard` rather than
   trusting the JWT.
9. **Account unlock** (M3): admin "unlock user" endpoint + optional time-based reset of
   `failedLoginAttempts`.
10. **Migrations** (M2): generate an initial TypeORM migration from the current schema;
    set `synchronize:false` everywhere except local dev; document the deploy flow.

### Phase 4 — Regression net
11. Add a **cross-tenant isolation test suite**: for every controller with an `:id`
    mutation, assert tenant A cannot read/update/delete tenant B's row. This
    institutionalizes the C2/M4 class of bug so it can't regress.

---

## Suggested first PR
Phase 1 items 1–2 (workflow authz + RBAC scoping) — highest severity, self-contained,
and covered by focused unit tests. Password reset (item 3) can ship in the same PR as
the "return 501 + hide UI" option if a full reset flow isn't yet in scope.

---

# IMPLEMENTATION STATUS (all phases complete except M2)

Suite grew from 923 → 960 tests, all passing across 81 suites. Each fix is
test-backed and pushed to `claude/app-build-setup-ntay5k`.

| Item | Status | Notes |
|------|--------|-------|
| C1 workflow authz | ✅ Done | approver enforcement (user/role/manager) + self-approval block + tenant scope; 7 tests |
| C2 RBAC role scoping | ✅ Done | findById/update/delete tenant-scoped; system roles protected; findAll no cross-tenant leak; 6 tests |
| C3 password reset | ✅ Done | real hashed-token flow (1h expiry, no enumeration) + account unlock; 4 tests |
| H1 atomic numbering | ✅ Done | SequenceService (global, INSERT…ON CONFLICT…RETURNING) + ALL 14 count()+1 sites retrofitted; 2 tests; repo-wide scan clean |
| H2 payroll dup run | ✅ Done | ConflictException on duplicate period+type; 2 tests |
| H3 ship relieves stock | ✅ Done | AtpService.issueForItem, called per line in shipOrder, throws on shortfall; 2 tests |
| H4 leave re-check | ✅ Done | availability re-validated at approval; 2 tests |
| H5 refresh status | ✅ Done | refresh + access-token validate reject non-ACTIVE accounts |
| M1 super-admin from DB | ✅ Verified/hardened | JwtStrategy already re-resolves from DB; added status check |
| M3 account unlock | ✅ Done | POST /users/:id/unlock; reset also unlocks |
| M2 migrations | 📋 Deploy task | needs a live DB to generate; synchronize already gated to dev only |
| Phase 4 regression net | ✅ Done | static test fails CI on any new tenant-unscoped findOne-by-id; 1 test |
| UsersController RBAC (follow-up) | ✅ Done | RbacGuard + @RequirePermission on all cross-user routes; me/me-profile stay open; 10 tests |

### H1 — retrofitted sites (all use SequenceService now)
cto (config + work-order), sourcing (event), controlling (internal order),
logistics (shipment), inventory-org (transfer), lockbox (batch), service-desk
(ticket), wht (certificate), rebate (agreement), wms (task), cpq (quote + sales
order), picking (wave), opm (batch).

### M2 — remaining deploy task
`synchronize` is gated to `APP_ENV==='development'` (config/database.config.ts).
For non-dev: generate a baseline with `typeorm migration:generate` against a
fresh DB, commit it under `src/database/migrations`, and run `migration:run` on
deploy. Not committed here because generating it accurately requires a live DB.
