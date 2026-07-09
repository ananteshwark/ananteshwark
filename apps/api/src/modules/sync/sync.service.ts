import { Injectable, Optional, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SyncMutation, SyncMutationStatus } from './entities/sync-mutation.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ExpenseClaim } from '../expenses/entities/expense-claim.entity';
import { LeaveApplication } from '../hr/leave/entities/leave-application.entity';
import { TravelRequest } from '../travel/entities/travel-request.entity';
import { HrCase } from '../helpdesk/entities/hr-case.entity';
import { MobileCheckin } from '../mobile/entities/mobile-checkin.entity';
import { MobileService } from '../mobile/mobile.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';

export interface SyncMutationInput {
  clientMutationId: string;
  type: string;
  payload: Record<string, any>;
}

export type MutationHandler = (
  tenantId: string,
  user: { id: string; employeeId: string | null },
  payload: Record<string, any>,
) => Promise<Record<string, any>>;

const PULL_LIMIT = 200;

/**
 * Delta-sync protocol for offline-first mobile clients.
 *
 * Pull: the device sends its last cursor (an ISO timestamp) and gets every
 * row of its self-scoped datasets touched since, plus a new cursor. Datasets
 * are a code-defined whitelist — nothing generic or injectable.
 *
 * Push: the device replays its offline outbox as typed mutations, each with a
 * client-generated id. The mutation log makes replay idempotent (exactly-once
 * apply, stored outcome on retry); handlers execute through the same services
 * the online API uses, so validation and side effects are identical.
 */
@Injectable()
export class SyncService {
  private readonly handlers = new Map<string, MutationHandler>();

  constructor(
    @Optional() @InjectRepository(SyncMutation) private readonly mutationRepo?: Repository<SyncMutation>,
    @Optional() @InjectRepository(Employee) private readonly employeeRepo?: Repository<Employee>,
    @Optional() @InjectRepository(ExpenseClaim) private readonly claimRepo?: Repository<ExpenseClaim>,
    @Optional() @InjectRepository(LeaveApplication) private readonly leaveRepo?: Repository<LeaveApplication>,
    @Optional() @InjectRepository(TravelRequest) private readonly travelRepo?: Repository<TravelRequest>,
    @Optional() @InjectRepository(HrCase) private readonly caseRepo?: Repository<HrCase>,
    @Optional() @InjectRepository(MobileCheckin) private readonly checkinRepo?: Repository<MobileCheckin>,
    @Optional() private readonly mobile?: MobileService,
    @Optional() private readonly helpdesk?: HelpdeskService,
  ) {
    // Offline actions that make sense to queue on a phone.
    if (this.mobile) {
      this.registerMutationHandler('checkin.create', async (tenantId, user, payload) => {
        const employeeId = payload.employeeId ?? user.employeeId;
        if (!employeeId) throw new BadRequestException('No employee record for this user');
        const checkin = await this.mobile!.checkIn(tenantId, { ...payload, employeeId } as any);
        return { id: checkin.id };
      });
      this.registerMutationHandler('checkin.checkout', async (tenantId, _user, payload) => {
        const checkin = await this.mobile!.checkOut(tenantId, payload.id, payload.at);
        return { id: checkin.id, hours: checkin.hours };
      });
    }
    if (this.helpdesk) {
      this.registerMutationHandler('hr_case.create', async (tenantId, user, payload) => {
        const hrCase = await this.helpdesk!.createCase(tenantId, user.id, payload as any);
        return { id: hrCase.id, caseNumber: hrCase.caseNumber };
      });
    }
  }

  /** Additional modules can contribute offline-queueable actions. */
  registerMutationHandler(type: string, handler: MutationHandler) {
    this.handlers.set(type, handler);
  }

  private datasets() {
    return [
      { key: 'expenses', repo: this.claimRepo, scope: 'employeeId' as const },
      { key: 'leaves', repo: this.leaveRepo, scope: 'employeeId' as const },
      { key: 'travel', repo: this.travelRepo, scope: 'employeeId' as const },
      { key: 'hr_cases', repo: this.caseRepo, scope: 'employeeId' as const },
      { key: 'checkins', repo: this.checkinRepo, scope: 'employeeId' as const },
    ];
  }

  coverage() {
    return {
      datasets: this.datasets().map((d) => ({ key: d.key, available: !!d.repo })),
      mutations: Array.from(this.handlers.keys()).sort(),
    };
  }

  private async resolveEmployeeId(tenantId: string, userId: string): Promise<string | null> {
    if (!this.employeeRepo) return null;
    const employee = await this.employeeRepo.findOne({ where: { tenantId, userId } as any });
    return employee?.id ?? null;
  }

  async pull(
    tenantId: string,
    userId: string,
    opts: { cursor?: string; datasets?: string[] } = {},
  ) {
    const since = opts.cursor ? new Date(opts.cursor) : new Date(0);
    if (Number.isNaN(since.getTime())) throw new BadRequestException('cursor must be an ISO timestamp');
    const wanted = (key: string) => !opts.datasets?.length || opts.datasets.includes(key);
    const employeeId = await this.resolveEmployeeId(tenantId, userId);

    const out: Record<string, { rows: any[]; hasMore: boolean }> = {};
    let maxSeen = since.getTime();
    for (const d of this.datasets()) {
      if (!wanted(d.key) || !d.repo) continue;
      if (!employeeId) {
        out[d.key] = { rows: [], hasMore: false };
        continue;
      }
      const rows = await d.repo.find({
        where: { tenantId, [d.scope]: employeeId, updatedAt: MoreThan(since) } as any,
        order: { updatedAt: 'ASC' } as any,
        take: PULL_LIMIT + 1,
      });
      const page = rows.slice(0, PULL_LIMIT);
      for (const r of page) {
        const t = new Date((r as any).updatedAt).getTime();
        if (t > maxSeen) maxSeen = t;
      }
      out[d.key] = { rows: page, hasMore: rows.length > PULL_LIMIT };
    }

    return {
      cursor: new Date(maxSeen).toISOString(),
      hasMore: Object.values(out).some((d) => d.hasMore),
      datasets: out,
    };
  }

  async push(
    tenantId: string,
    userId: string,
    deviceId: string,
    mutations: SyncMutationInput[],
  ) {
    if (!this.mutationRepo) throw new BadRequestException('Sync is not available in this deployment');
    if (!deviceId?.trim()) throw new BadRequestException('deviceId is required');
    const employeeId = await this.resolveEmployeeId(tenantId, userId);
    const user = { id: userId, employeeId };

    const results: Array<{ clientMutationId: string; status: string; result?: any; error?: string; replayed?: boolean }> = [];
    for (const m of mutations ?? []) {
      if (!m.clientMutationId?.trim() || !m.type?.trim()) {
        results.push({ clientMutationId: m.clientMutationId ?? '', status: 'REJECTED', error: 'clientMutationId and type are required' });
        continue;
      }
      const existing = await this.mutationRepo.findOne({
        where: { tenantId, deviceId, clientMutationId: m.clientMutationId },
      });
      if (existing) {
        results.push({
          clientMutationId: m.clientMutationId,
          status: existing.status,
          result: existing.result ?? undefined,
          error: existing.error ?? undefined,
          replayed: true,
        });
        continue;
      }
      const handler = this.handlers.get(m.type);
      if (!handler) {
        results.push({ clientMutationId: m.clientMutationId, status: 'REJECTED', error: `Unknown mutation type "${m.type}"` });
        continue;
      }
      let status = SyncMutationStatus.APPLIED;
      let result: Record<string, any> | null = null;
      let error: string | null = null;
      try {
        result = await handler(tenantId, user, m.payload ?? {});
      } catch (e: any) {
        status = SyncMutationStatus.FAILED;
        error = e?.message ?? 'Mutation failed';
      }
      await this.mutationRepo.save(
        this.mutationRepo.create({
          tenantId, userId, deviceId,
          clientMutationId: m.clientMutationId,
          type: m.type, payload: m.payload ?? {},
          status, result, error,
        }),
      );
      results.push({ clientMutationId: m.clientMutationId, status, result: result ?? undefined, error: error ?? undefined });
    }
    return { results };
  }
}
