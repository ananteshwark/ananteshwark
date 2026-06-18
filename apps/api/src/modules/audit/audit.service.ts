import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

export interface AuditLogEntry {
  tenantId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<AuditLog> {
    const log = this.auditLogRepository.create(entry);
    return this.auditLogRepository.save(log);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    filters?: {
      userId?: string;
      resourceType?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<PaginatedResponseDto<AuditLog>> {
    const { page = 1, limit = 20 } = pagination;

    const queryBuilder = this.auditLogRepository
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId });

    if (filters?.userId) {
      queryBuilder.andWhere('log.userId = :userId', { userId: filters.userId });
    }
    if (filters?.resourceType) {
      queryBuilder.andWhere('log.resourceType = :resourceType', { resourceType: filters.resourceType });
    }
    if (filters?.action) {
      queryBuilder.andWhere('log.action = :action', { action: filters.action });
    }
    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('log.createdAt BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    queryBuilder.orderBy('log.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }
}
