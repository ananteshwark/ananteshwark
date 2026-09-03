import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecognitionBadge, Recognition, RecognitionVisibility } from './entities/recognition.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class RecognitionService {
  constructor(
    @InjectRepository(RecognitionBadge) private readonly badgeRepo: Repository<RecognitionBadge>,
    @InjectRepository(Recognition) private readonly recognitionRepo: Repository<Recognition>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Badge catalog ────────────────────────────────────────────

  async createBadge(tenantId: string, dto: Partial<RecognitionBadge>): Promise<RecognitionBadge> {
    const badge = this.badgeRepo.create({ ...dto, tenantId });
    return this.badgeRepo.save(badge);
  }

  async listBadges(tenantId: string, activeOnly = false): Promise<RecognitionBadge[]> {
    return this.badgeRepo.find({
      where: activeOnly ? { tenantId, isActive: true } : { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async updateBadge(tenantId: string, id: string, dto: Partial<RecognitionBadge>): Promise<RecognitionBadge> {
    const badge = await this.badgeRepo.findOne({ where: { id, tenantId } });
    if (!badge) throw new NotFoundException(`Badge ${id} not found`);
    Object.assign(badge, dto, { id: badge.id, tenantId });
    return this.badgeRepo.save(badge);
  }

  // ─── Giving recognition ───────────────────────────────────────

  async give(
    tenantId: string,
    from: { userId: string; name: string },
    dto: { badgeId: string; toEmployeeId: string; toName: string; message: string; visibility?: RecognitionVisibility },
  ): Promise<Recognition> {
    const badge = await this.badgeRepo.findOne({ where: { id: dto.badgeId, tenantId } });
    if (!badge) throw new NotFoundException(`Badge ${dto.badgeId} not found`);
    if (!badge.isActive) throw new BadRequestException(`Badge "${badge.name}" is no longer active`);
    if (!dto.message?.trim()) throw new BadRequestException('A recognition message is required');
    const recognition = this.recognitionRepo.create({
      tenantId,
      badgeId: badge.id,
      badgeName: badge.name,
      badgeIcon: badge.icon,
      fromUserId: from.userId,
      fromName: from.name,
      toEmployeeId: dto.toEmployeeId,
      toName: dto.toName,
      message: dto.message.trim(),
      points: badge.points,
      visibility: dto.visibility ?? RecognitionVisibility.PUBLIC,
    });
    const saved = await this.recognitionRepo.save(recognition);
    await this.automation?.emit(tenantId, 'recognition.given', {
      recognitionId: saved.id, badgeName: saved.badgeName, points: saved.points,
      fromName: saved.fromName, toEmployeeId: saved.toEmployeeId, toName: saved.toName,
    });
    return saved;
  }

  /** Total recognition points earned by an employee — the reward-store ledger source. */
  async pointsFor(tenantId: string, employeeId: string): Promise<number> {
    const rows = await this.recognitionRepo.find({ where: { tenantId, toEmployeeId: employeeId } });
    return rows.reduce((sum, r) => sum + Number(r.points || 0), 0);
  }

  async wall(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Recognition>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.recognitionRepo.findAndCount({
      where: { tenantId, visibility: RecognitionVisibility.PUBLIC },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async forEmployee(tenantId: string, employeeId: string): Promise<Recognition[]> {
    return this.recognitionRepo.find({
      where: { tenantId, toEmployeeId: employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Points leaderboard, optionally limited to recognitions on/after `since`. */
  async leaderboard(tenantId: string, since?: string, top = 10) {
    const all = await this.recognitionRepo.find({ where: { tenantId } });
    const cutoff = since ? new Date(since).getTime() : null;
    const byEmployee = new Map<string, { employeeId: string; name: string; points: number; count: number }>();
    for (const r of all) {
      if (cutoff && new Date(r.createdAt).getTime() < cutoff) continue;
      const row = byEmployee.get(r.toEmployeeId) ?? { employeeId: r.toEmployeeId, name: r.toName, points: 0, count: 0 };
      row.points += r.points || 0;
      row.count += 1;
      row.name = r.toName;
      byEmployee.set(r.toEmployeeId, row);
    }
    return Array.from(byEmployee.values())
      .sort((a, b) => b.points - a.points || b.count - a.count)
      .slice(0, top);
  }
}
