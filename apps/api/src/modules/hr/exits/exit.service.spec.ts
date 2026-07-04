import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExitService } from './exit.service';
import { ExitReason, ExitStatus } from './entities/exit-request.entity';
import { ChecklistItemStatus } from './entities/exit-checklist-item.entity';
import { FnfStatus } from './entities/fnf-settlement.entity';
import { EmployeeStatus } from '../employees/entities/employee.entity';

/**
 * Exit management: default checklist seeding, clearance progression, the
 * COMPLETED → employee-status side effect, and the F&F settlement math and
 * DRAFT → APPROVED → PAID lifecycle (with recompute lock after approval).
 */
describe('ExitService', () => {
  let service: ExitService;
  let exitRepo: any, checklistRepo: any, fnfRepo: any, employeeRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(() => {
    exitRepo = mockRepo(); checklistRepo = mockRepo(); fnfRepo = mockRepo(); employeeRepo = mockRepo();
    service = new ExitService(exitRepo, checklistRepo, fnfRepo, employeeRepo);
  });

  it('create seeds the 5-item default checklist and starts INITIATED', async () => {
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', firstName: 'A', lastName: 'B' });
    exitRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1', employeeId: 'e1', status: ExitStatus.INITIATED });
    await service.create('t1', { employeeId: 'e1', lastWorkingDate: '2026-08-31' });
    expect(exitRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: ExitStatus.INITIATED, reason: ExitReason.RESIGNATION }));
    const seeded = checklistRepo.save.mock.calls[0][0];
    expect(seeded).toHaveLength(5);
    expect(seeded.map((i: any) => i.assignedDept)).toEqual(['IT', 'Admin', 'Finance', 'HR', 'Manager']);
  });

  it('clearing the first checklist item advances the exit to IN_CLEARANCE', async () => {
    checklistRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', exitRequestId: 'x1' });
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', status: ExitStatus.INITIATED });
    const item = await service.updateChecklistItem('t1', 'i1', { status: ChecklistItemStatus.CLEARED });
    expect(item.clearedAt).toBeInstanceOf(Date);
    expect(exitRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ExitStatus.IN_CLEARANCE }));
  });

  it('completing an exit stamps the employee status by reason', async () => {
    const exit: any = { id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31', reason: ExitReason.TERMINATION };
    exitRepo.findOne.mockResolvedValue(exit);
    const emp: any = { id: 'e1', tenantId: 't1', status: EmployeeStatus.ACTIVE };
    employeeRepo.findOne.mockResolvedValue(emp);
    checklistRepo.find.mockResolvedValue([]);
    fnfRepo.findOne.mockResolvedValue(null);
    await service.update('t1', 'x1', { status: ExitStatus.COMPLETED });
    expect(emp.status).toBe(EmployeeStatus.TERMINATED);
    expect(emp.dateOfLeaving).toBe('2026-08-31');
  });

  it('computeFnf nets salary + encashment + gratuity - deductions with rounding', async () => {
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1' });
    const fnf = await service.computeFnf('t1', 'x1', {
      pendingSalary: 1000.005, leaveEncashment: 200.10, gratuity: 300, deductions: 150.055,
    });
    expect(fnf.pendingSalary).toBe(1000.01);
    expect(fnf.deductions).toBe(150.06);
    expect(fnf.netAmount).toBe(1350.05);
    expect(fnf.status).toBe(FnfStatus.DRAFT);
  });

  it('computeFnf refuses to recompute an approved settlement', async () => {
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1' });
    fnfRepo.findOne.mockResolvedValue({ id: 'f1', status: FnfStatus.APPROVED });
    await expect(service.computeFnf('t1', 'x1', {})).rejects.toThrow(BadRequestException);
  });

  it('approveFnf requires DRAFT and settles the exit; markFnfPaid requires APPROVED', async () => {
    fnfRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FnfStatus.DRAFT });
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', status: ExitStatus.IN_CLEARANCE });
    const fnf = await service.approveFnf('t1', 'x1');
    expect(fnf.status).toBe(FnfStatus.APPROVED);
    expect(exitRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ExitStatus.SETTLED }));

    fnfRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FnfStatus.DRAFT });
    await expect(service.markFnfPaid('t1', 'x1')).rejects.toThrow(BadRequestException);

    fnfRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FnfStatus.APPROVED });
    const paid = await service.markFnfPaid('t1', 'x1');
    expect(paid.status).toBe(FnfStatus.PAID);
  });

  it('create 404s for an unknown employee', async () => {
    employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.create('t1', { employeeId: 'ghost', lastWorkingDate: '2026-01-01' })).rejects.toThrow(NotFoundException);
  });
});
