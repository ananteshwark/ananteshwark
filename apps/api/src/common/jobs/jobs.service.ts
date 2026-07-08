import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { JobRecord, JobStatus } from './job-record.entity';
import { LeaseService } from '../leases/lease.service';

export type JobHandler = (payload: Record<string, any>, job: JobRecord) => Promise<void>;

const POLL_MS = 15_000;
const BACKOFF_BASE_MS = 30_000;

/**
 * Durable job queue on Postgres — no Redis dependency for correctness.
 * enqueue() persists work; any instance claims jobs atomically via
 * FOR UPDATE SKIP LOCKED, so a job runs exactly once even under scale-out.
 * Failures retry with exponential backoff until maxAttempts, then park as
 * DEAD for the operator. The polling loop is lease-gated so only the leader
 * polls; claiming stays safe even if two pollers ever overlap.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workerId = randomUUID();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(JobRecord) private readonly jobRepo: Repository<JobRecord>,
    @Optional() private readonly leases?: LeaseService,
  ) {}

  onModuleInit() {
    if (process.env.JEST_WORKER_ID || process.env.APP_ENV === 'test') return;
    this.timer = setInterval(() => this.tick().catch(() => undefined), POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(
    type: string,
    payload: Record<string, any> = {},
    opts: { tenantId?: string; runAt?: Date; maxAttempts?: number } = {},
  ): Promise<JobRecord> {
    return this.jobRepo.save(this.jobRepo.create({
      type,
      payload,
      tenantId: opts.tenantId ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
      status: JobStatus.PENDING,
      attempts: 0,
    }));
  }

  /** Atomically claim the next due job. SKIP LOCKED makes concurrent claimers safe. */
  async claimNext(): Promise<JobRecord | null> {
    const rows: JobRecord[] = await this.jobRepo.query(
      `UPDATE sys_jobs SET status = 'RUNNING', locked_by = $1, attempts = attempts + 1
       WHERE id = (
         SELECT id FROM sys_jobs
         WHERE status = 'PENDING' AND run_at <= NOW()
         ORDER BY run_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [this.workerId],
    );
    return rows?.[0] ?? null;
  }

  /** Claim + run one job. Returns what happened so callers/tests can assert. */
  async processNext(): Promise<'idle' | 'completed' | 'retried' | 'dead'> {
    const job = await this.claimNext();
    if (!job) return 'idle';

    const handler = this.handlers.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      await handler(job.payload ?? {}, job);
      await this.jobRepo.update({ id: job.id }, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        lastError: null,
      } as any);
      return 'completed';
    } catch (e: any) {
      const attempts = Number(job.attempts); // already incremented by the claim
      if (attempts >= Number(job.maxAttempts)) {
        await this.jobRepo.update({ id: job.id }, {
          status: JobStatus.DEAD,
          lastError: e.message,
        } as any);
        this.logger.error(`job ${job.type}#${job.id} dead after ${attempts} attempts: ${e.message}`);
        return 'dead';
      }
      const delayMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
      await this.jobRepo.update({ id: job.id }, {
        status: JobStatus.PENDING,
        runAt: new Date(Date.now() + delayMs),
        lastError: e.message,
      } as any);
      this.logger.warn(`job ${job.type}#${job.id} failed (attempt ${attempts}), retry in ${delayMs / 1000}s`);
      return 'retried';
    }
  }

  /** Leader-only poll: drain due jobs, a bounded batch per tick. */
  async tick(maxPerTick = 20): Promise<number> {
    if (this.leases) {
      const isLeader = await this.leases.tryAcquire('jobs-worker', this.workerId, 2 * POLL_MS);
      if (!isLeader) return 0;
    }
    let processed = 0;
    while (processed < maxPerTick) {
      const outcome = await this.processNext();
      if (outcome === 'idle') break;
      processed += 1;
    }
    return processed;
  }

  /** Operator views: dead jobs needing attention, and a status breakdown. */
  async deadJobs(limit = 50): Promise<JobRecord[]> {
    return this.jobRepo.find({ where: { status: JobStatus.DEAD }, order: { createdAt: 'DESC' }, take: limit });
  }

  async retryDead(id: string): Promise<void> {
    await this.jobRepo.update({ id, status: JobStatus.DEAD } as any, {
      status: JobStatus.PENDING,
      attempts: 0,
      runAt: new Date(),
      lastError: null,
    } as any);
  }
}
