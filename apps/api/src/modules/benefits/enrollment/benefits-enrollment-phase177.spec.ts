import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BenefitsEnrollmentService } from './benefits-enrollment.service';
import { EnrollmentWindow, WindowStatus } from './entities/enrollment-window.entity';
import { LifeEvent, LifeEventType, LifeEventStatus } from './entities/life-event.entity';
import { BenefitPlan } from '../entities/benefit-plan.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('BenefitsEnrollmentService — Phase 178-180', () => {
  let service: BenefitsEnrollmentService;
  let windowRepo: any, eventRepo: any, planRepo: any;

  beforeEach(async () => {
    windowRepo = mockRepo(); eventRepo = mockRepo(); planRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        BenefitsEnrollmentService,
        { provide: getRepositoryToken(EnrollmentWindow), useValue: windowRepo },
        { provide: getRepositoryToken(LifeEvent), useValue: eventRepo },
        { provide: getRepositoryToken(BenefitPlan), useValue: planRepo },
      ],
    }).compile();
    service = module.get(BenefitsEnrollmentService);
  });

  // ─── Ph-178: windows ──────────────────────────────────────────────

  it('createWindow — rejects end before start', async () => {
    await expect(service.createWindow('t1', { name: 'OE', planYear: 2026, startDate: '2026-11-01', endDate: '2026-10-01' })).rejects.toThrow(BadRequestException);
  });

  it('isOpenWindowActive — true within an OPEN window', async () => {
    windowRepo.find.mockResolvedValue([{ startDate: '2026-11-01', endDate: '2026-11-30', status: WindowStatus.OPEN }]);
    expect(await service.isOpenWindowActive('t1', '2026-11-15')).toBe(true);
    expect(await service.isOpenWindowActive('t1', '2026-12-15')).toBe(false);
  });

  // ─── Ph-179: life events ──────────────────────────────────────────

  it('recordLifeEvent — sets 30-day election deadline by default', async () => {
    const e = await service.recordLifeEvent('t1', { employeeId: 'emp1', eventType: LifeEventType.MARRIAGE, eventDate: '2026-06-01' });
    expect(eventRepo.create).toHaveBeenCalledWith(expect.objectContaining({ electionDeadline: '2026-07-01', status: LifeEventStatus.OPEN }));
    expect(e.id).toBe('gen-1');
  });

  it('recordLifeEvent — honours custom election days', async () => {
    await service.recordLifeEvent('t1', { employeeId: 'e1', eventType: LifeEventType.BIRTH, eventDate: '2026-06-01', electionDays: 60 });
    expect(eventRepo.create).toHaveBeenCalledWith(expect.objectContaining({ electionDeadline: '2026-07-31' }));
  });

  it('expireLapsedEvents — expires open events past deadline', async () => {
    eventRepo.find.mockResolvedValue([
      { id: 'e1', status: LifeEventStatus.OPEN, electionDeadline: '2026-05-01' },
      { id: 'e2', status: LifeEventStatus.OPEN, electionDeadline: '2026-12-01' },
    ]);
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.expireLapsedEvents('t1', '2026-06-15');
    expect(r.expired).toBe(1);
  });

  it('completeLifeEvent — rejects non-open', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: LifeEventStatus.COMPLETED });
    await expect(service.completeLifeEvent('t1', 'e1')).rejects.toThrow(BadRequestException);
  });

  // ─── eligibility ──────────────────────────────────────────────────

  it('canElect — eligible during open window', async () => {
    windowRepo.find.mockResolvedValue([{ startDate: '2026-11-01', endDate: '2026-11-30', status: WindowStatus.OPEN }]);
    const r = await service.canElect('t1', 'emp1', '2026-11-10');
    expect(r.eligible).toBe(true);
  });

  it('canElect — eligible via open life event within deadline', async () => {
    windowRepo.find.mockResolvedValue([]);
    eventRepo.find.mockResolvedValue([{ eventType: LifeEventType.MARRIAGE, status: LifeEventStatus.OPEN, electionDeadline: '2026-07-01' }]);
    const r = await service.canElect('t1', 'emp1', '2026-06-20');
    expect(r.eligible).toBe(true);
  });

  it('canElect — not eligible with no window or event', async () => {
    windowRepo.find.mockResolvedValue([]);
    eventRepo.find.mockResolvedValue([]);
    const r = await service.canElect('t1', 'emp1', '2026-06-20');
    expect(r.eligible).toBe(false);
  });

  // ─── Ph-180: deductions ───────────────────────────────────────────

  it('computeDeduction — FIXED plan per-period from annual', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', name: 'Medical', contributionType: 'FIXED', employeeContribution: 100, employerContribution: 300 });
    const d = await service.computeDeduction('t1', 'p1', 12);
    expect(d.employeePerPeriod).toBe(100);
    expect(d.employerPerPeriod).toBe(300);
    expect(d.employeeAnnual).toBe(1200);
  });

  it('computeDeduction — PERCENTAGE plan uses salary', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', name: '401k', contributionType: 'PERCENTAGE', employeeContribution: 6, employerContribution: 3 });
    const d = await service.computeDeduction('t1', 'p1', 12, 120000);
    // 6% of 120000 = 7200/yr → 600/period
    expect(d.employeeAnnual).toBe(7200);
    expect(d.employeePerPeriod).toBe(600);
    expect(d.employerPerPeriod).toBe(300);
  });

  it('computeDeduction — rejects bad pay periods', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', contributionType: 'FIXED', employeeContribution: 1, employerContribution: 1 });
    await expect(service.computeDeduction('t1', 'p1', 0)).rejects.toThrow(BadRequestException);
  });

  it('computeDeduction — throws when plan missing', async () => {
    planRepo.findOne.mockResolvedValue(null);
    await expect(service.computeDeduction('t1', 'nope', 12)).rejects.toThrow(NotFoundException);
  });
});
