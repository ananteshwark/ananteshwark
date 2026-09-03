import { BadRequestException } from '@nestjs/common';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryStage, DisciplinaryStatus, DisciplinarySeverity } from './entities/disciplinary.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('DisciplinaryService', () => {
  let service: DisciplinaryService;
  let caseRepo: any, actionRepo: any, eventRepo: any, automation: any;

  beforeEach(() => {
    caseRepo = mockRepo(); actionRepo = mockRepo(); eventRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new DisciplinaryService(caseRepo, actionRepo, eventRepo, automation);
  });

  it('opens a case, writes an opening timeline entry and emits an event', async () => {
    const kase = await service.openCase('t1', { employeeId: 'e1', employeeName: 'Ann', description: 'Repeated lateness' });
    expect(kase).toMatchObject({ status: DisciplinaryStatus.OPEN, currentStage: DisciplinaryStage.NONE });
    expect(eventRepo.save).toHaveBeenCalled();
    expect(automation.emit).toHaveBeenCalledWith('t1', 'disciplinary.opened', expect.objectContaining({ employeeId: 'e1' }));
  });

  it('rejects a case with no description', async () => {
    await expect(service.openCase('t1', { employeeId: 'e1', employeeName: 'Ann', description: '  ' })).rejects.toThrow(BadRequestException);
  });

  describe('progressive discipline', () => {
    it('advances one stage forward and emits an event', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', employeeId: 'e1', severity: DisciplinarySeverity.MINOR, status: DisciplinaryStatus.OPEN, currentStage: DisciplinaryStage.NONE });
      const action = await service.issueAction('t1', 'c1', { actionStage: DisciplinaryStage.VERBAL_WARNING });
      expect(action.actionStage).toBe(DisciplinaryStage.VERBAL_WARNING);
      expect(caseRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentStage: DisciplinaryStage.VERBAL_WARNING }));
      expect(automation.emit).toHaveBeenCalledWith('t1', 'disciplinary.action_issued', expect.objectContaining({ actionStage: DisciplinaryStage.VERBAL_WARNING }));
    });

    it('refuses to skip stages for non-gross cases', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', severity: DisciplinarySeverity.MAJOR, status: DisciplinaryStatus.OPEN, currentStage: DisciplinaryStage.NONE });
      await expect(service.issueAction('t1', 'c1', { actionStage: DisciplinaryStage.TERMINATION })).rejects.toThrow(BadRequestException);
    });

    it('allows gross misconduct to jump straight to termination', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', employeeId: 'e1', severity: DisciplinarySeverity.GROSS, status: DisciplinaryStatus.OPEN, currentStage: DisciplinaryStage.NONE });
      const action = await service.issueAction('t1', 'c1', { actionStage: DisciplinaryStage.TERMINATION });
      expect(action.actionStage).toBe(DisciplinaryStage.TERMINATION);
    });

    it('refuses to move backwards', async () => {
      caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', severity: DisciplinarySeverity.MAJOR, status: DisciplinaryStatus.DECISION, currentStage: DisciplinaryStage.WRITTEN_WARNING });
      await expect(service.issueAction('t1', 'c1', { actionStage: DisciplinaryStage.VERBAL_WARNING })).rejects.toThrow(BadRequestException);
    });
  });

  it('closes a case and emits disciplinary.closed', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', employeeId: 'e1', status: DisciplinaryStatus.DECISION, currentStage: DisciplinaryStage.WRITTEN_WARNING });
    const closed = await service.closeCase('t1', 'c1', { outcome: 'Written warning issued' });
    expect(closed.status).toBe(DisciplinaryStatus.CLOSED);
    expect(closed.closedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'disciplinary.closed', expect.objectContaining({ outcome: 'Written warning issued' }));
  });

  it('filters active warnings by expiry', async () => {
    actionRepo.find.mockResolvedValue([
      { id: 'a1', expiresAt: '2026-12-31' },
      { id: 'a2', expiresAt: '2026-01-01' }, // expired
      { id: 'a3', expiresAt: null },          // never expires
    ]);
    const active = await service.activeWarnings('t1', 'e1', '2026-07-10');
    expect(active.map((a) => a.id)).toEqual(['a1', 'a3']);
  });
});
