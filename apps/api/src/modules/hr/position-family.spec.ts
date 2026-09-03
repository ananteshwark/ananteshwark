import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PositionService } from './employees/position.service';
import { PositionStatus } from './employees/entities/position.entity';
import { FamilyService } from './family/family.service';
import { NomineeForType } from './family/entities/nominee.entity';

/**
 * Positions: headcount recalculation and OPEN/FILLED flips on assign/unassign,
 * headcount dashboard math. Family: nominee percentage validation (per-type
 * 100% cap) and employee-scoped rows.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  remove: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
});

describe('PositionService', () => {
  let service: PositionService;
  let positionRepo: any, gradeRepo: any, employeeRepo: any, departmentRepo: any;

  beforeEach(() => {
    positionRepo = mockRepo(); gradeRepo = mockRepo(); employeeRepo = mockRepo(); departmentRepo = mockRepo();
    service = new PositionService(positionRepo, gradeRepo, employeeRepo, departmentRepo);
  });

  it('createPosition rejects a headcount below 1', async () => {
    await expect(service.createPosition('t1', { title: 'Dev', budgetedHeadcount: 0 })).rejects.toThrow(BadRequestException);
  });

  it('assignEmployee recalculates filled headcount and flips to FILLED at budget', async () => {
    const position: any = { id: 'p1', tenantId: 't1', budgetedHeadcount: 2, filledHeadcount: 1, status: PositionStatus.OPEN };
    positionRepo.findOne.mockResolvedValue(position);
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', positionId: null });
    employeeRepo.count.mockResolvedValue(2);
    const p = await service.assignEmployee('t1', 'p1', 'e1');
    expect(p.filledHeadcount).toBe(2);
    expect(p.status).toBe(PositionStatus.FILLED);
  });

  it('unassignEmployee reopens a FILLED position when headcount drops', async () => {
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', positionId: 'p1' });
    const position: any = { id: 'p1', tenantId: 't1', budgetedHeadcount: 2, filledHeadcount: 2, status: PositionStatus.FILLED };
    positionRepo.findOne.mockResolvedValue(position);
    employeeRepo.count.mockResolvedValue(1);
    const emp = await service.unassignEmployee('t1', 'e1');
    expect(emp.positionId).toBeNull();
    expect(position.status).toBe(PositionStatus.OPEN);
    expect(position.filledHeadcount).toBe(1);
  });

  it('deletePosition soft-closes instead of removing', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: PositionStatus.OPEN });
    const p = await service.deletePosition('t1', 'p1');
    expect(p.status).toBe(PositionStatus.CLOSED);
    expect(positionRepo.save).toHaveBeenCalled();
  });

  it('getHeadcountDashboard sums budget/filled and computes utilization', async () => {
    departmentRepo.find.mockResolvedValue([{ id: 'd1', name: 'Eng' }]);
    positionRepo.find.mockResolvedValue([
      { departmentId: 'd1', budgetedHeadcount: 5, filledHeadcount: 3 },
      { departmentId: 'd1', budgetedHeadcount: 5, filledHeadcount: 4 },
    ]);
    const d = await service.getHeadcountDashboard('t1');
    expect(d.summary).toEqual({ totalBudgeted: 10, totalFilled: 7, totalVacant: 3, utilizationPct: 70 });
    expect(d.byDepartment[0]).toMatchObject({ departmentName: 'Eng', budgeted: 10, filled: 7, vacant: 3 });
  });
});

describe('FamilyService', () => {
  let service: FamilyService;
  let dependentRepo: any, nomineeRepo: any, employeeRepo: any;

  beforeEach(() => {
    dependentRepo = mockRepo(); nomineeRepo = mockRepo(); employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1' });
    service = new FamilyService(dependentRepo, nomineeRepo, employeeRepo);
  });

  it('addNominee rejects out-of-range percentages', async () => {
    await expect(service.addNominee('t1', 'e1', { name: 'X', relationship: 'spouse', percentage: 0 })).rejects.toThrow(BadRequestException);
    await expect(service.addNominee('t1', 'e1', { name: 'X', relationship: 'spouse', percentage: 101 })).rejects.toThrow(BadRequestException);
  });

  it('addNominee caps the per-type sum at 100%', async () => {
    nomineeRepo.find.mockResolvedValue([{ percentage: 60 }, { percentage: 30 }]);
    await expect(
      service.addNominee('t1', 'e1', { name: 'X', relationship: 'spouse', percentage: 20, forType: NomineeForType.PF }),
    ).rejects.toThrow(/exceed 100%/);

    const ok = await service.addNominee('t1', 'e1', { name: 'X', relationship: 'spouse', percentage: 10, forType: NomineeForType.PF });
    expect(ok.percentage).toBe(10);
  });

  it('nominee sums are tracked per forType, not globally', async () => {
    nomineeRepo.find.mockImplementation(({ where }: any) =>
      Promise.resolve(where.forType === NomineeForType.PF ? [{ percentage: 100 }] : []));
    const g = await service.addNominee('t1', 'e1', { name: 'X', relationship: 'kin', percentage: 100, forType: NomineeForType.GRATUITY });
    expect(g.forType).toBe(NomineeForType.GRATUITY);
  });

  it('dependent/nominee deletion is scoped to tenant + employee', async () => {
    dependentRepo.findOne.mockResolvedValue(null);
    await expect(service.deleteDependent('t1', 'e1', 'd1')).rejects.toThrow(NotFoundException);
    expect(dependentRepo.findOne).toHaveBeenCalledWith({ where: { id: 'd1', tenantId: 't1', employeeId: 'e1' } });
  });

  it('addDependent 404s for an unknown employee', async () => {
    employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.addDependent('t1', 'ghost', { name: 'X', relationship: 'child' })).rejects.toThrow(NotFoundException);
  });
});
