import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RecruitingConnector, ConnectorType, JobPublication, PublicationStatus,
  AssessmentOrder, AssessmentStatus,
} from './entities/connector.entity';
import { ConnectorAdapter } from './connector.adapter';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class RecruitingConnectorsService {
  constructor(
    @InjectRepository(RecruitingConnector) private readonly connectorRepo: Repository<RecruitingConnector>,
    @InjectRepository(JobPublication) private readonly pubRepo: Repository<JobPublication>,
    @InjectRepository(AssessmentOrder) private readonly orderRepo: Repository<AssessmentOrder>,
    private readonly adapter: ConnectorAdapter,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Connector registry ───────────────────────────────────────

  async registerConnector(tenantId: string, dto: { type: ConnectorType; provider: string; config?: Record<string, any> }): Promise<RecruitingConnector> {
    if (!ConnectorAdapter.supports(dto.type)) throw new BadRequestException('A valid connector type is required');
    if (!dto.provider?.trim()) throw new BadRequestException('provider is required');
    return this.connectorRepo.save(this.connectorRepo.create({
      tenantId, type: dto.type, provider: dto.provider.trim(), config: dto.config ?? {}, enabled: true,
    }));
  }

  listConnectors(tenantId: string, type?: ConnectorType): Promise<RecruitingConnector[]> {
    const where: any = { tenantId };
    if (type) where.type = type;
    return this.connectorRepo.find({ where, order: { provider: 'ASC' } });
  }

  async setEnabled(tenantId: string, id: string, enabled: boolean): Promise<RecruitingConnector> {
    const c = await this.connectorRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Connector ${id} not found`);
    c.enabled = enabled;
    return this.connectorRepo.save(c);
  }

  private async requireConnector(tenantId: string, id: string, type: ConnectorType): Promise<RecruitingConnector> {
    const c = await this.connectorRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Connector ${id} not found`);
    if (c.type !== type) throw new BadRequestException(`Connector ${id} is not a ${type} connector`);
    if (!c.enabled) throw new BadRequestException('Connector is disabled');
    return c;
  }

  // ─── Job publishing ───────────────────────────────────────────

  async publishJob(tenantId: string, dto: { jobId: string; connectorId: string; title?: string }): Promise<JobPublication> {
    const connector = await this.requireConnector(tenantId, dto.connectorId, ConnectorType.JOB_BOARD);
    if (!dto.jobId) throw new BadRequestException('jobId is required');
    const result = await this.adapter.publishJob(connector.provider, connector.config, { jobId: dto.jobId, title: dto.title });
    const pub = await this.pubRepo.save(this.pubRepo.create({
      tenantId, jobId: dto.jobId, connectorId: connector.id, provider: connector.provider,
      status: result.ok ? PublicationStatus.PUBLISHED : PublicationStatus.PENDING,
      externalRef: result.externalRef ?? null, error: result.ok ? null : (result.reason ?? null),
      publishedAt: result.ok ? new Date() : null,
    }));
    if (result.ok) await this.automation?.emit(tenantId, 'recruiting.job_published', { jobId: dto.jobId, provider: connector.provider, externalRef: result.externalRef });
    return pub;
  }

  listPublications(tenantId: string, jobId?: string): Promise<JobPublication[]> {
    const where: any = { tenantId };
    if (jobId) where.jobId = jobId;
    return this.pubRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async closePublication(tenantId: string, id: string): Promise<JobPublication> {
    const pub = await this.pubRepo.findOne({ where: { id, tenantId } });
    if (!pub) throw new NotFoundException(`Publication ${id} not found`);
    pub.status = PublicationStatus.CLOSED;
    return this.pubRepo.save(pub);
  }

  // ─── Assessments ──────────────────────────────────────────────

  async orderAssessment(tenantId: string, dto: { candidateId: string; connectorId: string; assessmentKey?: string }): Promise<AssessmentOrder> {
    const connector = await this.requireConnector(tenantId, dto.connectorId, ConnectorType.ASSESSMENT);
    if (!dto.candidateId) throw new BadRequestException('candidateId is required');
    const result = await this.adapter.orderAssessment(connector.provider, connector.config, { candidateId: dto.candidateId, assessmentKey: dto.assessmentKey });
    return this.orderRepo.save(this.orderRepo.create({
      tenantId, candidateId: dto.candidateId, connectorId: connector.id, provider: connector.provider,
      assessmentKey: dto.assessmentKey ?? null, status: AssessmentStatus.ORDERED, externalRef: result.externalRef ?? null,
    }));
  }

  /** Inbound webhook ingest: match an order by external ref and record the result. */
  async ingestAssessmentResult(tenantId: string, dto: { externalRef: string; status?: AssessmentStatus; score?: number; resultUrl?: string }): Promise<AssessmentOrder> {
    if (!dto.externalRef) throw new BadRequestException('externalRef is required');
    const order = await this.orderRepo.findOne({ where: { tenantId, externalRef: dto.externalRef } });
    if (!order) throw new NotFoundException(`No assessment order for ref ${dto.externalRef}`);
    order.status = dto.status ?? AssessmentStatus.COMPLETED;
    if (dto.score != null) order.score = Number(dto.score);
    if (dto.resultUrl) order.resultUrl = dto.resultUrl;
    const saved = await this.orderRepo.save(order);
    if (saved.status === AssessmentStatus.COMPLETED) {
      await this.automation?.emit(tenantId, 'assessment.completed', { candidateId: saved.candidateId, provider: saved.provider, score: saved.score });
    }
    return saved;
  }

  listAssessmentOrders(tenantId: string, candidateId?: string): Promise<AssessmentOrder[]> {
    const where: any = { tenantId };
    if (candidateId) where.candidateId = candidateId;
    return this.orderRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ─── Calendar ─────────────────────────────────────────────────

  async scheduleEvent(tenantId: string, dto: { connectorId: string; summary: string; start: string; end: string; attendees?: string[] }): Promise<{ scheduled: boolean; externalRef?: string; reason?: string }> {
    const connector = await this.requireConnector(tenantId, dto.connectorId, ConnectorType.CALENDAR);
    if (!dto.summary?.trim() || !dto.start || !dto.end) throw new BadRequestException('summary, start and end are required');
    const result = await this.adapter.createCalendarEvent(connector.provider, connector.config, { summary: dto.summary, start: dto.start, end: dto.end, attendees: dto.attendees });
    return { scheduled: result.ok, externalRef: result.externalRef, reason: result.reason };
  }
}
