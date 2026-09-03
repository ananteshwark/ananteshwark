import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LearningProvider, LearningProviderType, XapiStatement,
  TrainingSession, TrainingMode, SessionStatus,
} from './entities/learning-ecosystem.entity';
import { MeetingAdapter } from './meeting.adapter';
import { AutomationService } from '../../automation/automation.service';

// Map common xAPI verb ids/IRIs to a canonical verb.
const VERB_MAP: Record<string, string> = {
  'http://adlnet.gov/expapi/verbs/completed': 'completed',
  'http://adlnet.gov/expapi/verbs/passed': 'passed',
  'http://adlnet.gov/expapi/verbs/failed': 'failed',
  'http://adlnet.gov/expapi/verbs/attempted': 'attempted',
  'http://adlnet.gov/expapi/verbs/experienced': 'experienced',
  completed: 'completed', passed: 'passed', failed: 'failed', attempted: 'attempted', experienced: 'experienced',
};

@Injectable()
export class LearningEcosystemService {
  constructor(
    @InjectRepository(LearningProvider) private readonly providerRepo: Repository<LearningProvider>,
    @InjectRepository(XapiStatement) private readonly xapiRepo: Repository<XapiStatement>,
    @InjectRepository(TrainingSession) private readonly sessionRepo: Repository<TrainingSession>,
    private readonly meeting: MeetingAdapter,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Providers ────────────────────────────────────────────────

  async registerProvider(tenantId: string, dto: { type: LearningProviderType; name: string; provider: string; config?: Record<string, any> }): Promise<LearningProvider> {
    if (!Object.values(LearningProviderType).includes(dto.type)) throw new BadRequestException('A valid provider type is required');
    if (!dto.name?.trim() || !dto.provider?.trim()) throw new BadRequestException('name and provider are required');
    return this.providerRepo.save(this.providerRepo.create({
      tenantId, type: dto.type, name: dto.name.trim(), provider: dto.provider.trim(), config: dto.config ?? {}, enabled: true,
    }));
  }

  listProviders(tenantId: string, type?: LearningProviderType): Promise<LearningProvider[]> {
    const where: any = { tenantId };
    if (type) where.type = type;
    return this.providerRepo.find({ where, order: { name: 'ASC' } });
  }

  // ─── xAPI ingest ──────────────────────────────────────────────

  /** Normalize a raw xAPI statement into {actorEmail, verb, objectId, result}. */
  static normalize(raw: any): { rawId: string; actorEmail: string; verb: string; objectId: string; result: Record<string, any> } {
    const rawId = raw?.id ?? '';
    const mbox = raw?.actor?.mbox ?? raw?.actor?.account?.name ?? '';
    const actorEmail = String(mbox).replace(/^mailto:/i, '').trim().toLowerCase();
    const verbKey = raw?.verb?.id ?? raw?.verb?.display?.['en-US'] ?? raw?.verb ?? '';
    const verb = VERB_MAP[String(verbKey)] ?? String(verbKey || 'experienced').toLowerCase();
    const objectId = raw?.object?.id ?? raw?.object ?? '';
    const result = raw?.result ?? {};
    return { rawId, actorEmail, verb, objectId, result };
  }

  /** Ingest an xAPI statement idempotently (dedup by statement id). */
  async ingestStatement(tenantId: string, raw: any): Promise<{ statement: XapiStatement; duplicate: boolean }> {
    const n = LearningEcosystemService.normalize(raw);
    if (!n.rawId) throw new BadRequestException('xAPI statement id is required');
    if (!n.actorEmail || !n.objectId) throw new BadRequestException('actor mbox and object id are required');
    const existing = await this.xapiRepo.findOne({ where: { tenantId, rawId: n.rawId } });
    if (existing) return { statement: existing, duplicate: true };
    const statement = await this.xapiRepo.save(this.xapiRepo.create({
      tenantId, rawId: n.rawId, actorEmail: n.actorEmail, verb: n.verb, objectId: n.objectId, result: n.result, processed: false,
    }));
    if (n.verb === 'completed' || n.verb === 'passed') {
      await this.automation?.emit(tenantId, 'learning.xapi_completed', {
        statementId: statement.id, actorEmail: n.actorEmail, objectId: n.objectId, verb: n.verb, score: n.result?.score?.scaled ?? null,
      });
    }
    return { statement, duplicate: false };
  }

  listStatements(tenantId: string, actorEmail?: string): Promise<XapiStatement[]> {
    const where: any = { tenantId };
    if (actorEmail) where.actorEmail = actorEmail.toLowerCase();
    return this.xapiRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ─── ILT / VILT sessions ──────────────────────────────────────

  async createSession(tenantId: string, dto: { title: string; mode?: TrainingMode; meetingProviderId?: string; startAt: string; endAt: string; location?: string; capacity?: number }): Promise<TrainingSession> {
    if (!dto.title?.trim() || !dto.startAt || !dto.endAt) throw new BadRequestException('title, startAt and endAt are required');
    if (Date.parse(dto.endAt) <= Date.parse(dto.startAt)) throw new BadRequestException('endAt must be after startAt');
    const mode = dto.mode ?? TrainingMode.ILT;
    let joinUrl: string | null = null;
    if (mode === TrainingMode.VILT && dto.meetingProviderId) {
      const provider = await this.providerRepo.findOne({ where: { id: dto.meetingProviderId, tenantId, type: LearningProviderType.MEETING } });
      if (!provider) throw new NotFoundException('Meeting provider not found');
      const res = await this.meeting.createMeeting(provider.provider, provider.config, { title: dto.title, startAt: dto.startAt, endAt: dto.endAt });
      joinUrl = res.joinUrl ?? null;
    }
    return this.sessionRepo.save(this.sessionRepo.create({
      tenantId, title: dto.title.trim(), mode, meetingProviderId: dto.meetingProviderId ?? null,
      startAt: new Date(dto.startAt), endAt: new Date(dto.endAt), location: dto.location ?? null,
      joinUrl, capacity: dto.capacity ?? null, enrolledCount: 0, status: SessionStatus.SCHEDULED,
    }));
  }

  listSessions(tenantId: string, status?: SessionStatus): Promise<TrainingSession[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.sessionRepo.find({ where, order: { startAt: 'ASC' } });
  }

  async enroll(tenantId: string, sessionId: string): Promise<TrainingSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status !== SessionStatus.SCHEDULED) throw new BadRequestException('Enrolment is closed for this session');
    if (session.capacity != null && session.enrolledCount >= session.capacity) throw new BadRequestException('Session is full');
    session.enrolledCount += 1;
    return this.sessionRepo.save(session);
  }

  async setSessionStatus(tenantId: string, sessionId: string, status: SessionStatus): Promise<TrainingSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, tenantId } });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    session.status = status;
    return this.sessionRepo.save(session);
  }
}
