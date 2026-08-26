import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `status` to idempotency_keys.
 *
 * The interceptor now reserves the key BEFORE running the handler (so two
 * concurrent requests with the same Idempotency-Key can't both execute the
 * side effect); `status` distinguishes a reservation still in flight from a
 * completed call whose response can be replayed.
 *
 * Idempotent: fresh databases get the column from entity metadata via the
 * Baseline; this fills it in for databases adopted before it existed. Rows
 * that already exist are completed calls, so they backfill to 'done'.
 */
export class IdempotencyKeyStatus1756400000000 implements MigrationInterface {
  name = 'IdempotencyKeyStatus1756400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('idempotency_keys');
    if (table && !table.findColumnByName('status')) {
      await queryRunner.query(
        `ALTER TABLE "idempotency_keys" ADD COLUMN "status" character varying(16) NOT NULL DEFAULT 'in_progress'`,
      );
      await queryRunner.query(`UPDATE "idempotency_keys" SET "status" = 'done'`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('idempotency_keys');
    if (table && table.findColumnByName('status')) {
      await queryRunner.query(`ALTER TABLE "idempotency_keys" DROP COLUMN "status"`);
    }
  }
}
