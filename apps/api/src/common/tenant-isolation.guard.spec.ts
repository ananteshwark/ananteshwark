import * as fs from 'fs';
import * as path from 'path';

/**
 * Phase 4 regression net (roadmap): institutionalizes the tenant-isolation
 * invariant that C2/M4 violated. It fails if any NEW service introduces a
 * tenant-unscoped `findOne({ where: { id } })`, which is the exact pattern that
 * let one tenant read/mutate another tenant's rows.
 *
 * The allowlist holds the vetted exceptions: lookups of the Tenant entity
 * itself by its own id (super-admin-scoped), which are correct by construction.
 */
const ALLOWLIST = new Set([
  'admin/admin.service.ts',
  'tenants/tenants.service.ts',
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.service.ts') && !entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}

describe('Tenant isolation invariant (C2/M4 regression net)', () => {
  it('no service does a tenant-unscoped findOne by id outside the allowlist', () => {
    const modulesDir = path.resolve(__dirname, '..', 'modules');
    const offenders: string[] = [];
    // Match findOne where the ONLY key is `id` (no tenantId alongside it).
    const pattern = /findOne\(\{\s*where:\s*\{\s*id\s*\}\s*\}\)/;

    for (const file of walk(modulesDir)) {
      const rel = path.relative(modulesDir, file).replace(/\\/g, '/');
      if (pattern.test(fs.readFileSync(file, 'utf8')) && !ALLOWLIST.has(rel)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
