import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BgvCase, BgvCheck, BgvCaseStatus, BgvCheckStatus, BgvCheckType, BgvResult, BgvSubjectType,
} from './entities/bgv.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

// Check outcomes that end a check (anything else keeps the case open).
const TERMINAL_CHECK: BgvCheckStatus[] = [BgvCheckStatus.CLEAR, BgvCheckStatus.DISCREPANCY, BgvCheckStatus.FAILED];

@Injectable()
export class BgvService {
  constructor(
    @InjectRepository(BgvCase) private readonly caseRepo: Repository<BgvCase>,
    @InjectRepository(BgvCheck) private readonly checkRepo: Repository<BgvCheck>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  private async nextCaseNumber(tenantId: string): Promise<string> {
    const row = await this.caseRepo
      .createQueryBuilder('b')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(b.case_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('b.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `BGV-${String(next).padStart(6, '0')}`;
  }

  async initiate(
    tenantId: string,
    initiatedByUserId: string,
    dto: {
      subjectType: BgvSubjectType; subjectId: string; subjectName: string;
      packageName?: string; checkTypes: BgvCheckType[];
    },
  ): Promise<{ case: BgvCase; checks: BgvCheck[] }> {
    const checkTypes = Array.from(new Set(dto.checkTypes ?? []));
    if (!checkTypes.length) throw new BadRequestException('At least one check type is required');
    if (!dto.subjectId || !dto.subjectName?.trim()) {
      throw new BadRequestException('Subject id and name are required');
    }
    const caseNumber = await this.nextCaseNumber(tenantId);
    const bgvCase = await this.caseRepo.save(this.caseRepo.create({
      tenantId,
      caseNumber,
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      subjectName: dto.subjectName.trim(),
      packageName: dto.packageName ?? null,
      status: BgvCaseStatus.INITIATED,
      overallResult: BgvResult.PENDING,
      initiatedByUserId,
    }));
    const checks = await this.checkRepo.save(
      checkTypes.map(type => this.checkRepo.create({
        tenantId, caseId: bgvCase.id, type, status: BgvCheckStatus.PENDING,
      })),
    );
    return { case: bgvCase, checks };
  }

  async listCases(
    tenantId: string, pagination: PaginationDto,
    filters: { status?: BgvCaseStatus; subjectType?: BgvSubjectType } = {},
  ): Promise<PaginatedResponseDto<BgvCase>> {
    const { page = 1, limit = 20 } = pagination;
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.subjectType) where.subjectType = filters.subjectType;
    const [items, total] = await this.caseRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getCase(tenantId: string, id: string): Promise<{ case: BgvCase; checks: BgvCheck[] }> {
    const bgvCase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!bgvCase) throw new NotFoundException(`BGV case ${id} not found`);
    const checks = await this.checkRepo.find({ where: { tenantId, caseId: id }, order: { createdAt: 'ASC' } });
    return { case: bgvCase, checks };
  }

  /**
   * Record a check outcome. When every check reaches a terminal status the
   * case auto-completes with the worst outcome (FAILED > DISCREPANCY > CLEAR)
   * and emits bgv.completed.
   */
  async updateCheck(
    tenantId: string, checkId: string, verifiedByUserId: string,
    dto: { status: BgvCheckStatus; remarks?: string },
  ): Promise<{ check: BgvCheck; case: BgvCase }> {
    const check = await this.checkRepo.findOne({ where: { id: checkId, tenantId } });
    if (!check) throw new NotFoundException(`BGV check ${checkId} not found`);
    const bgvCase = await this.caseRepo.findOne({ where: { id: check.caseId, tenantId } });
    if (!bgvCase) throw new NotFoundException(`BGV case ${check.caseId} not found`);
    if (bgvCase.status === BgvCaseStatus.COMPLETED || bgvCase.status === BgvCaseStatus.CANCELLED) {
      throw new BadRequestException(`Case ${bgvCase.caseNumber} is ${bgvCase.status}; checks are frozen`);
    }

    check.status = dto.status;
    check.remarks = dto.remarks ?? check.remarks;
    if (TERMINAL_CHECK.includes(dto.status)) {
      check.verifiedByUserId = verifiedByUserId;
      check.verifiedAt = new Date();
    }
    await this.checkRepo.save(check);

    const allChecks = await this.checkRepo.find({ where: { tenantId, caseId: bgvCase.id } });
    const allDone = allChecks.every(c => TERMINAL_CHECK.includes(c.status));
    if (allDone) {
      bgvCase.status = BgvCaseStatus.COMPLETED;
      bgvCase.completedAt = new Date();
      bgvCase.overallResult = allChecks.some(c => c.status === BgvCheckStatus.FAILED)
        ? BgvResult.FAILED
        : allChecks.some(c => c.status === BgvCheckStatus.DISCREPANCY)
          ? BgvResult.DISCREPANCY
          : BgvResult.CLEAR;
      await this.caseRepo.save(bgvCase);
      await this.automation?.emit(tenantId, 'bgv.completed', {
        caseId: bgvCase.id, caseNumber: bgvCase.caseNumber, subjectType: bgvCase.subjectType,
        subjectId: bgvCase.subjectId, subjectName: bgvCase.subjectName, overallResult: bgvCase.overallResult,
      });
    } else if (bgvCase.status === BgvCaseStatus.INITIATED) {
      bgvCase.status = BgvCaseStatus.IN_PROGRESS;
      await this.caseRepo.save(bgvCase);
    }
    return { check, case: bgvCase };
  }

  async cancel(tenantId: string, id: string): Promise<BgvCase> {
    const bgvCase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!bgvCase) throw new NotFoundException(`BGV case ${id} not found`);
    if (bgvCase.status === BgvCaseStatus.COMPLETED) {
      throw new BadRequestException('Completed cases cannot be cancelled');
    }
    bgvCase.status = BgvCaseStatus.CANCELLED;
    return this.caseRepo.save(bgvCase);
  }
}
