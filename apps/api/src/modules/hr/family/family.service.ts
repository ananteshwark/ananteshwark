import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dependent } from './entities/dependent.entity';
import { Nominee, NomineeForType } from './entities/nominee.entity';
import { Employee } from '../employees/entities/employee.entity';

@Injectable()
export class FamilyService {
  constructor(
    @InjectRepository(Dependent)
    private readonly dependentRepo: Repository<Dependent>,
    @InjectRepository(Nominee)
    private readonly nomineeRepo: Repository<Nominee>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  private async assertEmployee(tenantId: string, employeeId: string) {
    const emp = await this.employeeRepo.findOne({
      where: { id: employeeId, tenantId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
  }

  // ── Dependents ─────────────────────────────────────────────────────────────

  async listDependents(
    tenantId: string,
    employeeId: string,
  ): Promise<Dependent[]> {
    return this.dependentRepo.find({
      where: { tenantId, employeeId },
      order: { createdAt: 'ASC' },
    });
  }

  async addDependent(
    tenantId: string,
    employeeId: string,
    dto: {
      name: string;
      relationship: string;
      dateOfBirth?: string | null;
      gender?: string | null;
    },
  ): Promise<Dependent> {
    await this.assertEmployee(tenantId, employeeId);
    const dependent = this.dependentRepo.create({
      tenantId,
      employeeId,
      name: dto.name,
      relationship: dto.relationship,
      dateOfBirth: dto.dateOfBirth ?? null,
      gender: dto.gender ?? null,
    });
    return this.dependentRepo.save(dependent);
  }

  async deleteDependent(
    tenantId: string,
    employeeId: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    const dependent = await this.dependentRepo.findOne({
      where: { id, tenantId, employeeId },
    });
    if (!dependent) throw new NotFoundException('Dependent not found');
    await this.dependentRepo.remove(dependent);
    return { deleted: true };
  }

  // ── Nominees ───────────────────────────────────────────────────────────────

  async listNominees(
    tenantId: string,
    employeeId: string,
  ): Promise<Nominee[]> {
    return this.nomineeRepo.find({
      where: { tenantId, employeeId },
      order: { forType: 'ASC', createdAt: 'ASC' },
    });
  }

  async addNominee(
    tenantId: string,
    employeeId: string,
    dto: {
      name: string;
      relationship: string;
      percentage: number;
      forType?: NomineeForType;
    },
  ): Promise<Nominee> {
    await this.assertEmployee(tenantId, employeeId);
    const forType = dto.forType ?? NomineeForType.OTHER;
    const percentage = Number(dto.percentage ?? 0);
    if (percentage <= 0 || percentage > 100) {
      throw new BadRequestException('Percentage must be between 0 and 100');
    }

    // validate sum per forType <= 100
    const existing = await this.nomineeRepo.find({
      where: { tenantId, employeeId, forType },
    });
    const currentSum = existing.reduce((s, n) => s + Number(n.percentage), 0);
    if (currentSum + percentage > 100) {
      throw new BadRequestException(
        `Nominee percentages for ${forType} would exceed 100% (current ${currentSum}%, adding ${percentage}%)`,
      );
    }

    const nominee = this.nomineeRepo.create({
      tenantId,
      employeeId,
      name: dto.name,
      relationship: dto.relationship,
      percentage,
      forType,
    });
    return this.nomineeRepo.save(nominee);
  }

  async deleteNominee(
    tenantId: string,
    employeeId: string,
    id: string,
  ): Promise<{ deleted: boolean }> {
    const nominee = await this.nomineeRepo.findOne({
      where: { id, tenantId, employeeId },
    });
    if (!nominee) throw new NotFoundException('Nominee not found');
    await this.nomineeRepo.remove(nominee);
    return { deleted: true };
  }
}
