import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the `token_version` column to users, used to revoke previously-issued
 * refresh tokens on a password change/reset.
 *
 * Idempotent: fresh databases already have it (materialised from entity
 * metadata by the Baseline); this only fills the gap for databases adopted as
 * the baseline before the column existed. Existing rows start at 0, matching
 * the tokenVersion baked into any tokens already in circulation.
 */
export class UserTokenVersion1756300000001 implements MigrationInterface {
  name = 'UserTokenVersion1756300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table && !table.findColumnByName('token_version')) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table && table.findColumnByName('token_version')) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version"`);
    }
  }
}
