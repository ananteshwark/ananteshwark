import { Injectable, Logger } from '@nestjs/common';
import { ConnectorType } from './entities/connector.entity';

export interface ConnectorCallResult { ok: boolean; externalRef?: string; reason?: string }

/**
 * Recruiting-ecosystem connector seam: outbound calls to job boards, calendar
 * providers, and assessment vendors. The default adapter validates the request
 * and reports "provider not wired" rather than making a real call — mirroring
 * the other transmission seams. Real provider adapters (LinkedIn, Google
 * Calendar, HackerRank, …) can be supplied per deployment.
 */
@Injectable()
export class ConnectorAdapter {
  private readonly logger = new Logger(ConnectorAdapter.name);

  async publishJob(provider: string, config: Record<string, any>, job: { jobId: string; title?: string }): Promise<ConnectorCallResult> {
    this.logger.log(`recruiting seam: would publish job ${job.jobId} to ${provider} (not wired)`);
    return { ok: false, reason: `${provider} job-board connector not wired in this deployment` };
  }

  async orderAssessment(provider: string, config: Record<string, any>, order: { candidateId: string; assessmentKey?: string }): Promise<ConnectorCallResult> {
    this.logger.log(`recruiting seam: would order ${order.assessmentKey ?? 'assessment'} from ${provider} for ${order.candidateId} (not wired)`);
    return { ok: false, reason: `${provider} assessment connector not wired in this deployment` };
  }

  async createCalendarEvent(provider: string, config: Record<string, any>, event: { summary: string; start: string; end: string; attendees?: string[] }): Promise<ConnectorCallResult> {
    this.logger.log(`recruiting seam: would create "${event.summary}" on ${provider} (not wired)`);
    return { ok: false, reason: `${provider} calendar connector not wired in this deployment` };
  }

  static supports(type: ConnectorType): boolean {
    return Object.values(ConnectorType).includes(type);
  }
}
