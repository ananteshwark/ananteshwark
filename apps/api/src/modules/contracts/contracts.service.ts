import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Contract, ContractStatus, ContractType } from './entities/contract.entity';
import { ContractMilestone, MilestoneStatus } from './entities/contract-milestone.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import {
  CreateContractDto, UpdateContractDto, CreateMilestoneDto, CreateTemplateDto,
} from './dto/contracts.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(ContractMilestone)
    private readonly milestoneRepo: Repository<ContractMilestone>,
    @InjectRepository(ContractTemplate)
    private readonly templateRepo: Repository<ContractTemplate>,
  ) {}

  private async nextContractNumber(tenantId: string): Promise<string> {
    const row = await this.contractRepo
      .createQueryBuilder('c')
      .select(`MAX(CAST(NULLIF(regexp_replace(c.contract_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('c.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `CTR-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  // ---- Contracts ----
  async createContract(tenantId: string, dto: CreateContractDto, userId: string): Promise<Contract> {
    const contractNumber = await this.nextContractNumber(tenantId);
    return this.contractRepo.save(
      this.contractRepo.create({ ...dto, tenantId, contractNumber, ownerId: userId }),
    );
  }

  async listContracts(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { type?: string; status?: string; search?: string },
  ): Promise<PaginatedResponseDto<Contract>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = pagination;
    const qb = this.contractRepo.createQueryBuilder('c').where('c.tenantId = :tenantId', { tenantId });
    if (filters?.type) qb.andWhere('c.type = :type', { type: filters.type });
    if (filters?.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters?.search) {
      qb.andWhere('(c.contractNumber ILIKE :s OR c.title ILIKE :s OR c.counterpartyName ILIKE :s)', { s: `%${filters.search}%` });
    }
    qb.orderBy(`c.${sortBy}`, sortOrder as 'ASC' | 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findContract(tenantId: string, id: string): Promise<Contract> {
    const contract = await this.contractRepo.findOne({ where: { tenantId, id } });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  async updateContract(tenantId: string, id: string, dto: UpdateContractDto): Promise<Contract> {
    const contract = await this.findContract(tenantId, id);
    Object.assign(contract, dto);
    return this.contractRepo.save(contract);
  }

  async activateContract(tenantId: string, id: string): Promise<Contract> {
    const contract = await this.findContract(tenantId, id);
    if (contract.status !== ContractStatus.DRAFT) throw new BadRequestException('Only DRAFT contracts can be activated');
    contract.status = ContractStatus.ACTIVE;
    return this.contractRepo.save(contract);
  }

  async terminateContract(tenantId: string, id: string, reason?: string): Promise<Contract> {
    const contract = await this.findContract(tenantId, id);
    if (contract.status !== ContractStatus.ACTIVE) throw new BadRequestException('Only ACTIVE contracts can be terminated');
    contract.status = ContractStatus.TERMINATED;
    if (reason) contract.notes = (contract.notes ? contract.notes + '\n' : '') + `Termination: ${reason}`;
    return this.contractRepo.save(contract);
  }

  async renewContract(tenantId: string, id: string, newEndDate: string): Promise<Contract> {
    const contract = await this.findContract(tenantId, id);
    const renewed = await this.contractRepo.save(
      this.contractRepo.create({
        ...contract,
        id: undefined as any,
        contractNumber: await this.nextContractNumber(tenantId),
        startDate: contract.endDate || new Date().toISOString().slice(0, 10),
        endDate: newEndDate,
        status: ContractStatus.ACTIVE,
        renewalDate: undefined as any,
        createdAt: undefined as any,
        updatedAt: undefined as any,
      }),
    );
    contract.status = ContractStatus.RENEWED;
    await this.contractRepo.save(contract);
    return renewed;
  }

  async getExpiringContracts(tenantId: string, daysAhead = 30): Promise<Contract[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return this.contractRepo.find({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        endDate: LessThanOrEqual(cutoffStr),
      },
      order: { endDate: 'ASC' },
    });
  }

  // ---- Milestones ----
  async createMilestone(tenantId: string, contractId: string, dto: CreateMilestoneDto): Promise<ContractMilestone> {
    await this.findContract(tenantId, contractId);
    return this.milestoneRepo.save(
      this.milestoneRepo.create({ ...dto, tenantId, contractId }),
    );
  }

  async listMilestones(tenantId: string, contractId: string): Promise<ContractMilestone[]> {
    return this.milestoneRepo.find({ where: { tenantId, contractId }, order: { dueDate: 'ASC' } });
  }

  async completeMilestone(tenantId: string, id: string): Promise<ContractMilestone> {
    const ms = await this.milestoneRepo.findOne({ where: { tenantId, id } });
    if (!ms) throw new NotFoundException(`Milestone ${id} not found`);
    ms.status = MilestoneStatus.COMPLETED;
    ms.completedDate = new Date().toISOString().slice(0, 10);
    return this.milestoneRepo.save(ms);
  }

  // ---- Templates ----
  async createTemplate(tenantId: string, dto: CreateTemplateDto): Promise<ContractTemplate> {
    const existing = await this.templateRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Template code ${dto.code} already exists`);
    return this.templateRepo.save(this.templateRepo.create({ ...dto, tenantId }));
  }

  async listTemplates(tenantId: string, type?: ContractType): Promise<ContractTemplate[]> {
    const where: any = { tenantId, isActive: true };
    if (type) where.type = type;
    return this.templateRepo.find({ where });
  }
}
