import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  PayComponent,
  PayComponentType,
  CalculationType,
} from './entities/pay-component.entity';
import { SalaryStructure } from './entities/salary-structure.entity';
import { SalaryStructureComponent } from './entities/salary-structure-component.entity';
import {
  EmployeeSalary,
  ResolvedComponent,
} from './entities/employee-salary.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import {
  CreatePayComponentDto,
  UpdatePayComponentDto,
  CreateSalaryStructureDto,
  UpdateSalaryStructureDto,
  AssignSalaryDto,
} from './dto/component.dto';
import {
  PaginationDto,
  PaginatedResponseDto,
} from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ComponentService {
  constructor(
    @InjectRepository(PayComponent)
    private readonly componentRepo: Repository<PayComponent>,
    @InjectRepository(SalaryStructure)
    private readonly structureRepo: Repository<SalaryStructure>,
    @InjectRepository(SalaryStructureComponent)
    private readonly structureCompRepo: Repository<SalaryStructureComponent>,
    @InjectRepository(EmployeeSalary)
    private readonly salaryRepo: Repository<EmployeeSalary>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Pay components
  // ---------------------------------------------------------------------------

  async createComponent(
    tenantId: string,
    dto: CreatePayComponentDto,
  ): Promise<PayComponent> {
    const existing = await this.componentRepo.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Component code ${dto.code} already exists`);
    const comp = this.componentRepo.create({ ...dto, tenantId });
    return this.componentRepo.save(comp);
  }

  async findComponents(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { type?: string; isActive?: boolean },
  ): Promise<PaginatedResponseDto<PayComponent>> {
    const { page = 1, limit = 50 } = pagination;
    const qb = this.componentRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (filters?.type) qb.andWhere('c.type = :type', { type: filters.type });
    if (filters?.isActive !== undefined)
      qb.andWhere('c.isActive = :active', { active: filters.isActive });
    qb.orderBy('c.displayOrder', 'ASC')
      .addOrderBy('c.code', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findComponent(tenantId: string, id: string): Promise<PayComponent> {
    const comp = await this.componentRepo.findOne({ where: { id, tenantId } });
    if (!comp) throw new NotFoundException(`Component ${id} not found`);
    return comp;
  }

  async updateComponent(
    tenantId: string,
    id: string,
    dto: UpdatePayComponentDto,
  ): Promise<PayComponent> {
    const comp = await this.findComponent(tenantId, id);
    Object.assign(comp, dto);
    return this.componentRepo.save(comp);
  }

  // ---------------------------------------------------------------------------
  // Salary structures
  // ---------------------------------------------------------------------------

  async createStructure(
    tenantId: string,
    dto: CreateSalaryStructureDto,
  ): Promise<SalaryStructure> {
    return this.dataSource.transaction(async (manager) => {
      const structure = manager.create(SalaryStructure, {
        tenantId,
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
      });
      const saved = await manager.save(structure);
      if (dto.components?.length) {
        const comps = dto.components.map((c, idx) =>
          manager.create(SalaryStructureComponent, {
            tenantId,
            structureId: saved.id,
            componentId: c.componentId,
            value: c.value ?? null,
            percentage: c.percentage ?? null,
            sequence: c.sequence ?? idx,
          }),
        );
        await manager.save(comps);
      }
      return saved;
    });
  }

  async findStructures(tenantId: string): Promise<SalaryStructure[]> {
    return this.structureRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findStructure(tenantId: string, id: string): Promise<any> {
    const structure = await this.structureRepo.findOne({ where: { id, tenantId } });
    if (!structure) throw new NotFoundException(`Structure ${id} not found`);
    const links = await this.structureCompRepo.find({
      where: { structureId: id, tenantId },
      order: { sequence: 'ASC' },
    });
    const components = await Promise.all(
      links.map(async (link) => {
        const comp = await this.componentRepo.findOne({
          where: { id: link.componentId, tenantId },
        });
        return { ...link, component: comp };
      }),
    );
    return { ...structure, components };
  }

  async updateStructure(
    tenantId: string,
    id: string,
    dto: UpdateSalaryStructureDto,
  ): Promise<SalaryStructure> {
    return this.dataSource.transaction(async (manager) => {
      const structure = await manager.findOne(SalaryStructure, {
        where: { id, tenantId },
      });
      if (!structure) throw new NotFoundException(`Structure ${id} not found`);
      if (dto.name !== undefined) structure.name = dto.name;
      if (dto.description !== undefined) structure.description = dto.description;
      await manager.save(structure);
      if (dto.components) {
        await manager.delete(SalaryStructureComponent, { structureId: id, tenantId });
        const comps = dto.components.map((c, idx) =>
          manager.create(SalaryStructureComponent, {
            tenantId,
            structureId: id,
            componentId: c.componentId,
            value: c.value ?? null,
            percentage: c.percentage ?? null,
            sequence: c.sequence ?? idx,
          }),
        );
        await manager.save(comps);
      }
      return structure;
    });
  }

  // ---------------------------------------------------------------------------
  // Employee salaries
  // ---------------------------------------------------------------------------

  /**
   * Resolve monthly component amounts from CTC + structure. Uses the structure's
   * component links (percentage/value). Falls back to a standard India breakdown
   * (Basic 40% CTC, HRA 50% basic, special allowance balancing) if no structure.
   */
  private async resolveComponents(
    tenantId: string,
    ctc: number,
    structureId?: string | null,
  ): Promise<ResolvedComponent[]> {
    const monthlyCtc = round2(ctc / 12);
    const resolved: ResolvedComponent[] = [];

    if (structureId) {
      const links = await this.structureCompRepo.find({
        where: { structureId, tenantId },
        order: { sequence: 'ASC' },
      });
      if (links.length) {
        // First pass: compute earnings (so percentage-of-basic/gross can reference them)
        let basic = 0;
        // pre-compute basic from any component referencing CTC or with explicit value
        const compMap = new Map<string, PayComponent>();
        for (const link of links) {
          const comp = await this.componentRepo.findOne({
            where: { id: link.componentId, tenantId },
          });
          if (comp) compMap.set(link.componentId, comp);
        }

        // Pass 1: basic / gross-independent earnings
        for (const link of links) {
          const comp = compMap.get(link.componentId);
          if (!comp || comp.type !== PayComponentType.EARNING) continue;
          if ((comp.percentageOf ?? '').toUpperCase() === 'CTC' || link.percentage) {
            // percentage of CTC (monthly)
          }
        }

        let gross = 0;
        const earningsLinks = links.filter(
          (l) => compMap.get(l.componentId)?.type === PayComponentType.EARNING,
        );

        // compute basic first
        for (const link of earningsLinks) {
          const comp = compMap.get(link.componentId)!;
          if (comp.code === 'BASIC') {
            const pct = link.percentage ?? 40;
            basic = link.value != null ? link.value : round2((monthlyCtc * pct) / 100);
          }
        }
        if (basic === 0) basic = round2(monthlyCtc * 0.4);

        let allocatedEarnings = 0;
        const specialAllowanceLinks: SalaryStructureComponent[] = [];
        for (const link of earningsLinks) {
          const comp = compMap.get(link.componentId)!;
          let amount = 0;
          if (comp.code === 'BASIC') {
            amount = basic;
          } else if (comp.code === 'SPECIAL_ALLOWANCE') {
            specialAllowanceLinks.push(link);
            continue;
          } else if (link.value != null) {
            amount = link.value;
          } else if (link.percentage != null) {
            const base =
              (comp.percentageOf ?? '').toUpperCase() === 'BASIC' ? basic : monthlyCtc;
            amount = round2((base * link.percentage) / 100);
          } else if ((comp.percentageOf ?? '').toUpperCase() === 'BASIC') {
            amount = round2(basic * 0.5);
          }
          amount = round2(amount);
          allocatedEarnings = round2(allocatedEarnings + amount);
          resolved.push({
            code: comp.code,
            name: comp.name,
            type: comp.type,
            amount,
            isStatutory: comp.isStatutory,
            statutoryType: comp.statutoryType,
            glAccountCode: comp.glAccountCode,
          });
        }
        // special allowance = balancing figure
        for (const link of specialAllowanceLinks) {
          const comp = compMap.get(link.componentId)!;
          const amount = round2(Math.max(0, monthlyCtc - allocatedEarnings));
          allocatedEarnings = round2(allocatedEarnings + amount);
          resolved.push({
            code: comp.code,
            name: comp.name,
            type: comp.type,
            amount,
            isStatutory: comp.isStatutory,
            statutoryType: comp.statutoryType,
            glAccountCode: comp.glAccountCode,
          });
        }
        gross = allocatedEarnings;
        void gross;
        return resolved;
      }
    }

    // Fallback standard India breakdown
    const basic = round2(monthlyCtc * 0.4);
    const hra = round2(basic * 0.5);
    const special = round2(Math.max(0, monthlyCtc - basic - hra));
    return [
      {
        code: 'BASIC',
        name: 'Basic',
        type: PayComponentType.EARNING,
        amount: basic,
        glAccountCode: '6000',
      },
      {
        code: 'HRA',
        name: 'House Rent Allowance',
        type: PayComponentType.EARNING,
        amount: hra,
        glAccountCode: '6000',
      },
      {
        code: 'SPECIAL_ALLOWANCE',
        name: 'Special Allowance',
        type: PayComponentType.EARNING,
        amount: special,
        glAccountCode: '6000',
      },
    ];
  }

  async assignSalary(
    tenantId: string,
    dto: AssignSalaryDto,
  ): Promise<EmployeeSalary> {
    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const components = await this.resolveComponents(
      tenantId,
      dto.ctc,
      dto.structureId,
    );

    return this.dataSource.transaction(async (manager) => {
      // deactivate previous active salaries
      await manager.update(
        EmployeeSalary,
        { tenantId, employeeId: dto.employeeId, isActive: true },
        { isActive: false, effectiveTo: dto.effectiveFrom },
      );
      const salary = manager.create(EmployeeSalary, {
        tenantId,
        employeeId: dto.employeeId,
        structureId: dto.structureId ?? null,
        ctc: dto.ctc,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        components,
        isActive: true,
      });
      return manager.save(salary);
    });
  }

  async getEmployeeSalary(
    tenantId: string,
    employeeId: string,
    asOf?: string,
  ): Promise<EmployeeSalary | null> {
    const date = asOf ?? this.todayStr();
    const qb = this.salaryRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.employeeId = :employeeId', { employeeId })
      .andWhere('s.effectiveFrom <= :date', { date })
      .andWhere('(s.effectiveTo IS NULL OR s.effectiveTo >= :date)', { date })
      .orderBy('s.effectiveFrom', 'DESC');
    return (await qb.getOne()) ?? null;
  }

  async listEmployeeSalaries(tenantId: string): Promise<any[]> {
    const salaries = await this.salaryRepo.find({
      where: { tenantId, isActive: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      salaries.map(async (s) => {
        const emp = await this.employeeRepo.findOne({
          where: { id: s.employeeId, tenantId },
        });
        return {
          ...s,
          employeeCode: emp?.employeeCode ?? '',
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
        };
      }),
    );
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
