import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the optimistic-lock `version` column to workflow_instances.
 *
 * Idempotent: a freshly-created database already has the column (the Baseline
 * materialises it from entity metadata, which now includes @VersionColumn), so
 * this only fills the gap for databases that were adopted as the baseline
 * before the column existed. Existing rows start at version 1.
 */
export class WorkflowInstanceVersion1756300000000 implements MigrationInterface {
  name = 'WorkflowInstanceVersion1756300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('workflow_instances');
    if (table && !table.findColumnByName('version')) {
      await queryRunner.query(
        `ALTER TABLE "workflow_instances" ADD COLUMN "version" integer NOT NULL DEFAULT 1`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('workflow_instances');
    if (table && table.findColumnByName('version')) {
      await queryRunner.query(`ALTER TABLE "workflow_instances" DROP COLUMN "version"`);
    }
  }
}
