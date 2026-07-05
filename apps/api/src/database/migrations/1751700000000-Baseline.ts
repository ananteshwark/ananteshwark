import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration — adopt-or-create.
 *
 * Two starting points exist in the field:
 *  1. A fresh database: no tables at all. We build the full schema from the
 *     entity metadata (equivalent to one controlled `synchronize` run) and
 *     from here on only versioned migrations may change it.
 *  2. A database previously created by development-mode synchronize: the
 *     schema already exists. We adopt it as the baseline and do nothing —
 *     recording this migration as applied is exactly the point.
 *
 * The `tenants` table is the sentinel: it has existed since Phase 1, so its
 * presence reliably distinguishes the two cases.
 */
export class Baseline1751700000000 implements MigrationInterface {
  name = 'Baseline1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTenants = await queryRunner.hasTable('tenants');
    if (hasTenants) return; // existing schema adopted as baseline
    // Fresh database: materialize the schema from entity metadata once.
    await queryRunner.connection.synchronize(false);
  }

  public async down(): Promise<void> {
    // The baseline is not reversible — dropping the entire schema via a
    // migration revert would be a footgun, not a feature.
    throw new Error('The baseline migration cannot be reverted');
  }
}
