import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContinuousFeedback, FeedbackRequest, FeedbackKind, FeedbackVisibility, FeedbackRequestStatus,
} from './feedback.entity';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(ContinuousFeedback) private readonly feedbackRepo: Repository<ContinuousFeedback>,
    @InjectRepository(FeedbackRequest) private readonly requestRepo: Repository<FeedbackRequest>,
  ) {}

  async give(
    tenantId: string, author: { userId: string; name: string },
    dto: { toEmployeeId: string; body: string; kind?: FeedbackKind; visibility?: FeedbackVisibility; requestId?: string },
  ): Promise<ContinuousFeedback> {
    if (!dto.toEmployeeId || !dto.body?.trim()) {
      throw new BadRequestException('toEmployeeId and body are required');
    }
    if (dto.requestId) {
      const request = await this.requestRepo.findOne({ where: { id: dto.requestId, tenantId } });
      if (!request) throw new NotFoundException(`Feedback request ${dto.requestId} not found`);
      if (request.status !== FeedbackRequestStatus.OPEN) {
        throw new BadRequestException('This feedback request is closed');
      }
      if (!request.responderUserIds.includes(author.userId)) {
        throw new ForbiddenException('You were not asked to respond to this request');
      }
      if (request.aboutEmployeeId !== dto.toEmployeeId) {
        throw new BadRequestException('Feedback subject does not match the request');
      }
    }
    return this.feedbackRepo.save(this.feedbackRepo.create({
      tenantId,
      fromUserId: author.userId,
      fromName: author.name,
      toEmployeeId: dto.toEmployeeId,
      kind: dto.kind ?? FeedbackKind.PRAISE,
      visibility: dto.visibility ?? FeedbackVisibility.MANAGER,
      body: dto.body.trim(),
      requestId: dto.requestId ?? null,
    }));
  }

  /**
   * Feedback about an employee, filtered by what the viewer may see:
   * scope 'self' → everything about me; 'manager' → PUBLIC + MANAGER;
   * anything else → PUBLIC only.
   */
  async listFor(tenantId: string, toEmployeeId: string, scope: 'self' | 'manager' | 'public'): Promise<ContinuousFeedback[]> {
    const rows = await this.feedbackRepo.find({
      where: { tenantId, toEmployeeId },
      order: { createdAt: 'DESC' },
    });
    if (scope === 'self') return rows;
    if (scope === 'manager') return rows.filter((f) => f.visibility !== FeedbackVisibility.PRIVATE);
    return rows.filter((f) => f.visibility === FeedbackVisibility.PUBLIC);
  }

  async request(
    tenantId: string, requestedByUserId: string,
    dto: { aboutEmployeeId: string; responderUserIds: string[]; prompt: string },
  ): Promise<FeedbackRequest> {
    const responders = [...new Set((dto.responderUserIds ?? []).filter(Boolean))];
    if (!dto.aboutEmployeeId || !responders.length || !dto.prompt?.trim()) {
      throw new BadRequestException('aboutEmployeeId, responderUserIds and prompt are required');
    }
    return this.requestRepo.save(this.requestRepo.create({
      tenantId,
      requestedByUserId,
      aboutEmployeeId: dto.aboutEmployeeId,
      responderUserIds: responders,
      prompt: dto.prompt.trim(),
      status: FeedbackRequestStatus.OPEN,
    }));
  }

  /** Requests waiting on the caller. */
  async myPendingRequests(tenantId: string, userId: string): Promise<FeedbackRequest[]> {
    const open = await this.requestRepo.find({
      where: { tenantId, status: FeedbackRequestStatus.OPEN },
      order: { createdAt: 'DESC' },
    });
    const responded = await this.feedbackRepo.find({ where: { tenantId, fromUserId: userId } });
    const respondedRequestIds = new Set(responded.map((f) => f.requestId).filter(Boolean));
    return open.filter((r) => r.responderUserIds.includes(userId) && !respondedRequestIds.has(r.id));
  }

  async close(tenantId: string, id: string, userId: string): Promise<FeedbackRequest> {
    const request = await this.requestRepo.findOne({ where: { id, tenantId } });
    if (!request) throw new NotFoundException(`Feedback request ${id} not found`);
    if (request.requestedByUserId !== userId) {
      throw new ForbiddenException('Only the requester can close this request');
    }
    request.status = FeedbackRequestStatus.CLOSED;
    return this.requestRepo.save(request);
  }
}
