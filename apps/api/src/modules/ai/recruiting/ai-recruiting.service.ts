import { Injectable, Logger, Optional, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { CvParseUsage } from './entities/cv-parse-usage.entity';
import { LicensingService } from '../../licensing/licensing.service';
import { ConsumptionType } from '../../licensing/entities/consumption-record.entity';

export const AI_RECRUITING_LLM_CLIENT = 'AI_RECRUITING_LLM_CLIENT';

const DEFAULT_CV_MONTHLY_QUOTA = Number(process.env.AI_CV_MONTHLY_QUOTA ?? 500);

export interface TimeWindow { start: string; end: string } // ISO datetimes

export interface SchedulingInput {
  interviewers: Array<{ id: string; free: TimeWindow[] }>;
  panel: string[];                 // interviewer ids that must all attend
  candidateBusy?: TimeWindow[];
  durationMinutes: number;
  stepMinutes?: number;            // slot start granularity (default 30)
  limit?: number;                  // max proposed slots (default 5)
}

@Injectable()
export class AiRecruitingService {
  private readonly logger = new Logger(AiRecruitingService.name);
  private readonly client: Anthropic | null;

  constructor(
    @InjectRepository(CvParseUsage) private readonly usageRepo: Repository<CvParseUsage>,
    @Optional() @Inject(AI_RECRUITING_LLM_CLIENT) client?: Anthropic,
    @Optional() private readonly licensing?: LicensingService,
  ) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get cvParseEnabled(): boolean {
    return !!this.client;
  }

  // ─── Metered CV parsing ───────────────────────────────────────

  async cvParseUsage(tenantId: string, month: string): Promise<{ month: string; count: number; quota: number; remaining: number }> {
    const row = await this.usageRepo.findOne({ where: { tenantId, month } });
    const count = row?.count ?? 0;
    return { month, count, quota: DEFAULT_CV_MONTHLY_QUOTA, remaining: Math.max(0, DEFAULT_CV_MONTHLY_QUOTA - count) };
  }

  private async consumeMeter(tenantId: string, month: string): Promise<void> {
    let row = await this.usageRepo.findOne({ where: { tenantId, month } });
    if (!row) row = this.usageRepo.create({ tenantId, month, count: 0 });
    if (row.count >= DEFAULT_CV_MONTHLY_QUOTA) throw new ForbiddenException(`Monthly CV-parse quota of ${DEFAULT_CV_MONTHLY_QUOTA} reached`);
    row.count += 1;
    await this.usageRepo.save(row);

    // Fold the metered unit into license consumption so it shows up in
    // snapshots and consumption-based invoices. Best-effort: metering must
    // never fail because billing is unavailable.
    await this.licensing
      ?.recordConsumption(tenantId, {
        periodMonth: month,
        consumptionType: ConsumptionType.MODULE,
        moduleKey: 'ai',
        activeEmployees: 0,
        unitsConsumed: 1,
        unitRate: Number(process.env.AI_CV_UNIT_RATE ?? 0),
        notes: 'CV parse extraction',
      })
      .catch(() => undefined);
  }

  async parseCv(tenantId: string, month: string, input: { text?: string; imageBase64?: string; mediaType?: string }): Promise<{ available: boolean; reason?: string; fields?: any }> {
    if (!this.client) return { available: false, reason: 'CV parsing is not configured (no ANTHROPIC_API_KEY)' };
    if (!input.text?.trim() && !input.imageBase64) throw new BadRequestException('Provide CV text or an image');
    await this.consumeMeter(tenantId, month);

    const tool: Anthropic.Messages.ToolUnion = {
      name: 'record_candidate',
      description: 'Record the structured fields extracted from a candidate CV/resume.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          fullName: { type: ['string', 'null'] },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          currentTitle: { type: ['string', 'null'] },
          totalYearsExperience: { type: ['number', 'null'] },
          skills: { type: 'array', items: { type: 'string' } },
          education: { type: 'array', items: { type: 'string' } },
        },
        required: ['fullName', 'email', 'phone', 'currentTitle', 'totalYearsExperience', 'skills', 'education'],
        additionalProperties: false,
      },
    };
    const content: any[] = [];
    if (input.imageBase64) content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType ?? 'image/jpeg', data: input.imageBase64 } });
    if (input.text?.trim()) content.push({ type: 'text', text: input.text });
    content.push({ type: 'text', text: 'Extract candidate fields via record_candidate. Use null / empty arrays for anything absent; do not invent data.' });

    try {
      const response = await this.client.messages.create({
        model: process.env.AI_CV_MODEL ?? 'claude-opus-4-8',
        max_tokens: 1024,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'record_candidate' },
        messages: [{ role: 'user', content }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      return { available: true, fields: toolUse?.input ?? null };
    } catch (e: any) {
      this.logger.warn(`CV parse failed: ${e?.message ?? e}`);
      return { available: false, reason: 'CV parsing failed; please enter candidate details manually' };
    }
  }

  // ─── Auto interview scheduling (deterministic) ────────────────

  /** Intersection of two sets of time windows. */
  static intersect(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
    const out: TimeWindow[] = [];
    for (const x of a) for (const y of b) {
      const start = Math.max(Date.parse(x.start), Date.parse(y.start));
      const end = Math.min(Date.parse(x.end), Date.parse(y.end));
      if (end > start) out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
    return AiRecruitingService.merge(out);
  }

  /** Subtract busy windows from free windows. */
  static subtract(free: TimeWindow[], busy: TimeWindow[]): TimeWindow[] {
    let segments = free.map((f) => ({ start: Date.parse(f.start), end: Date.parse(f.end) }));
    for (const b of busy) {
      const bs = Date.parse(b.start), be = Date.parse(b.end);
      const next: Array<{ start: number; end: number }> = [];
      for (const s of segments) {
        if (be <= s.start || bs >= s.end) { next.push(s); continue; } // no overlap
        if (bs > s.start) next.push({ start: s.start, end: bs });
        if (be < s.end) next.push({ start: be, end: s.end });
      }
      segments = next;
    }
    return segments.filter((s) => s.end > s.start).map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() }));
  }

  /** Merge overlapping/adjacent windows. */
  static merge(windows: TimeWindow[]): TimeWindow[] {
    const sorted = windows.map((w) => ({ start: Date.parse(w.start), end: Date.parse(w.end) })).sort((a, b) => a.start - b.start);
    const out: Array<{ start: number; end: number }> = [];
    for (const w of sorted) {
      const last = out[out.length - 1];
      if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
      else out.push({ ...w });
    }
    return out.map((w) => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() }));
  }

  /** Enumerate slots of `durationMinutes` within free windows at `stepMinutes`. */
  static enumerateSlots(free: TimeWindow[], durationMinutes: number, stepMinutes: number, limit: number): TimeWindow[] {
    const slots: TimeWindow[] = [];
    const durMs = durationMinutes * 60000, stepMs = stepMinutes * 60000;
    for (const w of free) {
      let t = Date.parse(w.start);
      const end = Date.parse(w.end);
      while (t + durMs <= end && slots.length < limit) {
        slots.push({ start: new Date(t).toISOString(), end: new Date(t + durMs).toISOString() });
        t += stepMs;
      }
      if (slots.length >= limit) break;
    }
    return slots;
  }

  /**
   * Propose interview slots where every panel interviewer is free and the
   * candidate is available, for the required duration.
   */
  proposeSlots(input: SchedulingInput): { slots: TimeWindow[]; commonFree: TimeWindow[] } {
    if (!(input.durationMinutes > 0)) throw new BadRequestException('durationMinutes must be positive');
    const panel = input.panel ?? [];
    if (!panel.length) throw new BadRequestException('At least one panel interviewer is required');
    const byId = new Map(input.interviewers.map((i) => [i.id, AiRecruitingService.merge(i.free ?? [])]));

    let common: TimeWindow[] | null = null;
    for (const id of panel) {
      const free = byId.get(id);
      if (!free || !free.length) return { slots: [], commonFree: [] }; // one interviewer with no availability → no slots
      common = common == null ? free : AiRecruitingService.intersect(common, free);
      if (!common.length) return { slots: [], commonFree: [] };
    }
    let available = common ?? [];
    if (input.candidateBusy?.length) available = AiRecruitingService.subtract(available, input.candidateBusy);

    const slots = AiRecruitingService.enumerateSlots(available, input.durationMinutes, input.stepMinutes ?? 30, input.limit ?? 5);
    return { slots, commonFree: available };
  }
}
