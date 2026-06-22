import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position, PositionStatus } from './entities/position.entity';
import { Grade } from './entities/grade.entity';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(Position) private readonly positionRepo: Repository<Position>,
    @InjectRepository(Grade) private readonly gradeRepo: Repository<Grade>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
  ) {}

  async listPositions(tenantId: string, filters: { departmentId?: string; status?: string; search?: string }) {
    const qb = this.positionRepo.createQueryBuilder('p').where('p.tenantId = :tenantId', { tenantId });
    if (filters.departmentId) qb.andWhere('p.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.search) qb.andWhere('(p.title ILIKE :search OR p.positionCode ILIKE :search)', { search: `%${filters.search}%` });
    const positions = await qb.getMany();

    // Enrich with department names
    const departments = await this.departmentRepo.find({ where: { tenantId } });
    const deptMap = new Map(departments.map(d => [d.id, d.name]));

    return positions.map(pos => ({
      ...pos,
      departmentName: pos.departmentId ? deptMap.get(pos.departmentId) : null,
      vacantCount: Math.max(0, pos.budgetedHeadcount - pos.filledHeadcount),
    }));
  }

  async createPosition(tenantId: string, dto: any) {
    if (dto.budgetedHeadcount !== undefined && dto.budgetedHeadcount < 1) {
      throw new BadRequestException('Budgeted headcount must be at least 1');
    }
    const position = this.positionRepo.create({ ...dto, tenantId });
    return this.positionRepo.save(position);
  }

  async updatePosition(tenantId: string, id: string, dto: any) {
    const position = await this.positionRepo.findOne({ where: { id, tenantId } });
    if (!position) throw new NotFoundException(`Position ${id} not found`);
    Object.assign(position, dto);
    return this.positionRepo.save(position);
  }

  async deletePosition(tenantId: string, id: string) {
    const position = await this.positionRepo.findOne({ where: { id, tenantId } });
    if (!position) throw new NotFoundException(`Position ${id} not found`);
    position.status = PositionStatus.CLOSED;
    return this.positionRepo.save(position);
  }

  async assignEmployee(tenantId: string, positionId: string, employeeId: string) {
    const position = await this.positionRepo.findOne({ where: { id: positionId, tenantId } });
    if (!position) throw new NotFoundException(`Position ${positionId} not found`);

    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    // Unassign from old position if any
    if (employee.positionId && employee.positionId !== positionId) {
      await this.unassignEmployee(tenantId, employeeId);
    }

    employee.positionId = positionId;
    await this.employeeRepo.save(employee);

    // Recalculate filled headcount
    const filledCount = await this.employeeRepo.count({ where: { tenantId, positionId } });
    position.filledHeadcount = filledCount;
    if (position.filledHeadcount >= position.budgetedHeadcount) {
      position.status = PositionStatus.FILLED;
    } else if (position.status === PositionStatus.FILLED) {
      position.status = PositionStatus.OPEN;
    }
    return this.positionRepo.save(position);
  }

  async unassignEmployee(tenantId: string, employeeId: string) {
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const oldPositionId = employee.positionId;
    employee.positionId = null;
    await this.employeeRepo.save(employee);

    if (oldPositionId) {
      const position = await this.positionRepo.findOne({ where: { id: oldPositionId, tenantId } });
      if (position) {
        const filledCount = await this.employeeRepo.count({ where: { tenantId, positionId: oldPositionId } });
        position.filledHeadcount = filledCount;
        if (position.status === PositionStatus.FILLED && filledCount < position.budgetedHeadcount) {
          position.status = PositionStatus.OPEN;
        }
        await this.positionRepo.save(position);
      }
    }
    return employee;
  }

  async getHeadcountDashboard(tenantId: string) {
    const departments = await this.departmentRepo.find({ where: { tenantId } });
    const positions = await this.positionRepo.find({ where: { tenantId } });

    const byDept = departments.map(dept => {
      const deptPositions = positions.filter(p => p.departmentId === dept.id);
      const budgeted = deptPositions.reduce((sum, p) => sum + p.budgetedHeadcount, 0);
      const filled = deptPositions.reduce((sum, p) => sum + p.filledHeadcount, 0);
      return { departmentId: dept.id, departmentName: dept.name, budgeted, filled, vacant: budgeted - filled };
    });

    const totalBudgeted = positions.reduce((sum, p) => sum + p.budgetedHeadcount, 0);
    const totalFilled = positions.reduce((sum, p) => sum + p.filledHeadcount, 0);

    return {
      summary: { totalBudgeted, totalFilled, totalVacant: totalBudgeted - totalFilled, utilizationPct: totalBudgeted > 0 ? Math.round((totalFilled / totalBudgeted) * 100) : 0 },
      byDepartment: byDept,
    };
  }

  async getVacanciesList(tenantId: string) {
    const qb = this.positionRepo.createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.filledHeadcount < p.budgetedHeadcount')
      .andWhere('p.status != :closed', { closed: PositionStatus.CLOSED });
    return qb.getMany();
  }

  // Grades
  async listGrades(tenantId: string) {
    return this.gradeRepo.find({ where: { tenantId } });
  }

  async createGrade(tenantId: string, dto: any) {
    const grade = this.gradeRepo.create({ ...dto, tenantId });
    return this.gradeRepo.save(grade);
  }

  async updateGrade(tenantId: string, id: string, dto: any) {
    const grade = await this.gradeRepo.findOne({ where: { id, tenantId } });
    if (!grade) throw new NotFoundException(`Grade ${id} not found`);
    Object.assign(grade, dto);
    return this.gradeRepo.save(grade);
  }
}
