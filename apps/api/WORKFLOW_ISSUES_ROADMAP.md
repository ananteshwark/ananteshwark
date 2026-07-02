
---

# FIX STATUS (implementation progress)

| Item | Status | Commit note |
|------|--------|-------------|
| C1 workflow authz | ✅ Done | approver enforcement + self-approval block + tenant scope; 7 tests |
| C2 RBAC scoping | ✅ Done | findById/update/delete tenant-scoped; system roles protected; 6 tests |
| C3 password reset | ✅ Done | real hashed-token flow + account unlock; 4 tests |
| H5 refresh status | ✅ Done | refresh refuses non-ACTIVE accounts |
| H2 payroll dup run | ✅ Done | ConflictException on duplicate period+type; 2 tests |
| H3 ship relieves stock | ✅ Done | AtpService.issueForItem, called in shipOrder; 2 tests |
| H4 leave re-check | ✅ Done | availability re-validated at approval; 2 tests |
| H1 atomic numbering | 🟡 In progress | SequenceService primitive built (global) + retrofitted CTO, sourcing, controlling |
| M1 super-admin from DB | ⬜ Pending | Phase 3 |
| M2 migrations | ⬜ Pending | Phase 3 |
| M3 account unlock | ✅ Done (via C3) | reset clears lockout; standalone admin-unlock still pending |

### H1 — remaining `count()+1` numbering sites to retrofit to `SequenceService`
Mechanical: inject `SequenceService`, replace `count()+1` with
`this.sequence.formatted(tenantId, '<key>', '<PREFIX>', <pad>)`, update the
service's spec to provide a `SequenceService` mock.
- `finance/lockbox/lockbox.service.ts:345` (batch no.)
- `finance/ap/wht.service.ts:180` (WHT certificate)
- `logistics/logistics.service.ts:183` (transport plan)
- `inventory/inventory-org.service.ts:196` (inter-org transfer)
- `inventory/wms.service.ts:21` (warehouse task)
- `crm/service-desk/service-desk.service.ts:86` (ticket no.)
- `sales/cpq/cpq.service.ts:106,206` (quote / order)
- `sales/rebate.service.ts:17` (rebate)
- plus any other service using `count({ where: { tenantId } }) + 1` for a
  document number (grep: `count(` in `*.service.ts`).
