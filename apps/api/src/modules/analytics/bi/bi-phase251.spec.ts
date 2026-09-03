import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BiService } from './bi.service';
import { SubjectArea } from './entities/subject-area.entity';
import { SavedReport, ReportVisibility } from './entities/saved-report.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { KpiTile } from './entities/kpi-tile.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('BiService — Phase 251-254', () => {
  let service: BiService;
  let saRepo: any, reportRepo: any, scheduleRepo: any, tileRepo: any;

  beforeEach(async () => {
    saRepo = mockRepo(); reportRepo = mockRepo(); scheduleRepo = mockRepo(); tileRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        BiService,
        { provide: getRepositoryToken(SubjectArea), useValue: saRepo },
        { provide: getRepositoryToken(SavedReport), useValue: reportRepo },
        { provide: getRepositoryToken(ReportSchedule), useValue: scheduleRepo },
        { provide: getRepositoryToken(KpiTile), useValue: tileRepo },
      ],
    }).compile();
    service = module.get(BiService);
  });

  // ─── Ph-251: subject areas ────────────────────────────────────────

  it('seedDefaults — creates the four pillar subject areas', async () => {
    saRepo.count.mockResolvedValue(0);
    saRepo.findOne.mockResolvedValue(null);
    const r = await service.seedDefaults('t1');
    expect(r).toHaveLength(4);
  });

  // ─── Ph-252: report builder + execution ───────────────────────────

  it('createReport — rejects unknown dimension', async () => {
    saRepo.findOne.mockResolvedValue({ code: 'FIN_GL', dimensions: [{ key: 'account' }], measures: [{ key: 'amount' }] });
    await expect(service.createReport('t1', 'u1', { name: 'R', subjectAreaCode: 'FIN_GL', dimensions: ['nope'] })).rejects.toThrow(BadRequestException);
  });

  it('executeDefinition — filters, groups, aggregates, and sorts', () => {
    const rows = [
      { account: 'A', costCenter: 'CC1', amount: 100 },
      { account: 'A', costCenter: 'CC2', amount: 50 },
      { account: 'B', costCenter: 'CC1', amount: 200 },
      { account: 'B', costCenter: 'CC1', amount: 30 },
    ];
    const r = service.executeDefinition({
      dimensions: ['account'], measures: [{ key: 'amount', agg: 'SUM' }],
      filters: [{ field: 'amount', op: 'gte', value: 40 }], sort: [{ key: 'amount', dir: 'DESC' }],
    }, rows);
    // filter drops amount 30 → A: 100+50=150, B: 200 → sorted desc → B first
    expect(r.rows[0]).toMatchObject({ account: 'B', amount: 200 });
    expect(r.rows[1]).toMatchObject({ account: 'A', amount: 150 });
  });

  it('executeDefinition — no dimensions produces a single total row', () => {
    const r = service.executeDefinition({ measures: [{ key: 'amount', agg: 'SUM' }] }, [{ amount: 10 }, { amount: 20 }]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBe(30);
  });

  it('listReports — returns own + shared', async () => {
    reportRepo.find.mockResolvedValue([
      { id: 'r1', ownerId: 'u1', visibility: ReportVisibility.PERSONAL },
      { id: 'r2', ownerId: 'u2', visibility: ReportVisibility.SHARED },
      { id: 'r3', ownerId: 'u2', visibility: ReportVisibility.PERSONAL },
    ]);
    const r = await service.listReports('t1', 'u1');
    expect(r.map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  // ─── Ph-253: schedules ────────────────────────────────────────────

  it('createSchedule — rejects an invalid cron', async () => {
    reportRepo.findOne.mockResolvedValue({ id: 'r1' });
    await expect(service.createSchedule('t1', { reportId: 'r1', cron: 'every day', recipients: ['a@x.com'] })).rejects.toThrow(BadRequestException);
  });

  it('createSchedule — accepts a valid 5-field cron', async () => {
    reportRepo.findOne.mockResolvedValue({ id: 'r1' });
    scheduleRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const s = await service.createSchedule('t1', { reportId: 'r1', cron: '0 8 * * 1', recipients: ['a@x.com'] });
    expect(s.cron).toBe('0 8 * * 1');
  });

  // ─── Ph-254: KPI tiles ────────────────────────────────────────────

  it('computeTile — aggregates measure and compares to target', async () => {
    tileRepo.findOne.mockResolvedValue({ id: 'k1', title: 'Revenue', measure: 'value', agg: 'SUM', filters: [{ field: 'stage', op: 'eq', value: 'WON' }], target: 1000 });
    const rows = [{ stage: 'WON', value: 600 }, { stage: 'WON', value: 500 }, { stage: 'OPEN', value: 900 }];
    const r = await service.computeTile('t1', 'k1', rows);
    expect(r.value).toBe(1100); // WON only
    expect(r.attainmentPct).toBe(110);
    expect(r.status).toBe('ON_TARGET');
  });

  it('computeTile — below target status', async () => {
    tileRepo.findOne.mockResolvedValue({ id: 'k1', title: 'X', measure: 'value', agg: 'SUM', filters: [], target: 1000 });
    const r = await service.computeTile('t1', 'k1', [{ value: 400 }]);
    expect(r.status).toBe('BELOW');
  });
});
