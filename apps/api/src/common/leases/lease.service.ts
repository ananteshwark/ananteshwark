import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerLease } from './scheduler-lease.entity';

/**
 * Database-backed leader election for background jobs. In a multi-instance
 * deployment exactly one instance wins the lease per job name and runs the
 * tick; the others no-op. A crashed leader is replaced automatically once
 * its lease expires.
 */
@Injectable()
export class LeaseService {
  private readonly logger = new Logger(LeaseService.name);

  constructor(
    @InjectRepository(SchedulerLease)
    private readonly leaseRepo: Repository<SchedulerLease>,
  ) {}

  /**
   * Atomically acquire (or renew) the named lease. The single upsert makes
   * the decision in the database, so two instances racing on the same tick
   * cannot both win: the conditional UPDATE only steals an expired lease or
   * renews the caller's own.
   */
  async tryAcquire(name: string, holderId: string, ttlMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      const rows: Array<{ holder_id: string }> = await this.leaseRepo.query(
        `INSERT INTO scheduler_leases (name, holder_id, expires_at, "updatedAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (name) DO UPDATE
           SET holder_id = EXCLUDED.holder_id,
               expires_at = EXCLUDED.expires_at,
               "updatedAt" = NOW()
           WHERE scheduler_leases.expires_at < NOW()
              OR scheduler_leases.holder_id = EXCLUDED.holder_id
         RETURNING holder_id`,
        [name, holderId, expiresAt],
      );
      return rows.length > 0 && rows[0].holder_id === holderId;
    } catch (e: any) {
      // A lease-store hiccup must not kill the job scheduler; failing closed
      // (skip this tick) is the safe default for at-most-once work.
      this.logger.warn(`lease acquire failed for ${name}: ${e.message}`);
      return false;
    }
  }

  async release(name: string, holderId: string): Promise<void> {
    try {
      await this.leaseRepo.delete({ name, holderId });
    } catch {
      /* expiry will clean up */
    }
  }
}
