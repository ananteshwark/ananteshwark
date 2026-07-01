import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { GrcService } from './grc.service';
import { SodRule } from './entities/sod-rule.entity';
import { GrcControl } from './entities/grc-control.entity';
import { RiskEntry } from './entities/risk-entry.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('GrcService — Phase 285-288', () => {
  let service: GrcService;
  let sodRepo: any, controlRepo: any, riskRepo: any;

  beforeEach(async () => {
    sodRepo = mockRepo(); controlRepo = mockRepo(); riskRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        GrcService,
        { provide: getRepositoryToken(SodRule), useValue: sodRepo },
        { provide: getRepositoryToken(GrcControl), useValue: controlRepo },
        { provide: getRepositoryToken(RiskEntry), useValue: riskRepo },
      ],
    }).compile();
    service = module.get(GrcService);
  });

  // ─── Ph-285 ───────────────────────────────────────────────────────

  it('createSodRule — rejects identical permissions', async () => {
    await expect(service.createSodRule('t1', { name: 'x', permissionA: 'p', permissionB: 'p' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-286: violation detection ──────────────────────────────────

  it('detectViolations — flags a user holding both conflicting permissions', async () => {
    sodRepo.find.mockResolvedValue([
      { id: 'r1', name: 'Vendor+Pay', permissionA: 'vendor:create', permissionB: 'payment:approve', severity: 'CRITICAL' },
    ]);
    const r = await service.detectViolations('t1', [
      { userId: 'u1', permissions: ['vendor:create', 'payment:approve', 'gl:read'] },
      { userId: 'u2', permissions: ['vendor:create'] },
    ]);
    expect(r.violationCount).toBe(1);
    expect(r.violations[0].userId).toBe('u1');
    expect(r.bySeverity.CRITICAL).toBe(1);
  });

  it('detectViolations — no violations when only one side held', async () => {
    sodRepo.find.mockResolvedValue([{ permissionA: 'a', permissionB: 'b', severity: 'HIGH' }]);
    const r = await service.detectViolations('t1', [{ userId: 'u1', permissions: ['a'] }]);
    expect(r.violationCount).toBe(0);
  });

  // ─── Ph-287: controls ─────────────────────────────────────────────

  it('recordTest — updates status and appends evidence', async () => {
    controlRepo.findOne.mockResolvedValue({ id: 'c1', status: 'NOT_TESTED', evidence: [] });
    controlRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const c = await service.recordTest('t1', 'c1', { result: 'EFFECTIVE', at: '2026-06-30T00:00:00Z', note: 'ok' });
    expect(c.status).toBe('EFFECTIVE');
    expect(c.lastTestedAt).toBe('2026-06-30');
    expect(c.evidence).toHaveLength(1);
  });

  it('createControl — rejects duplicate code', async () => {
    controlRepo.findOne.mockResolvedValue({ id: 'c1' });
    await expect(service.createControl('t1', { code: 'C1', name: 'X' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-288: risk register + heat map ─────────────────────────────

  it('createRisk — computes score and level', async () => {
    riskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.createRisk('t1', { title: 'Data breach', likelihood: 4, impact: 5 });
    expect(r.score).toBe(20);
    expect(r.level).toBe('CRITICAL');
  });

  it('createRisk — rejects out-of-range likelihood', async () => {
    await expect(service.createRisk('t1', { title: 'x', likelihood: 6, impact: 3 })).rejects.toThrow(BadRequestException);
  });

  it('heatMap — buckets risks into the 5x5 grid and by level', async () => {
    riskRepo.find.mockResolvedValue([
      { likelihood: 4, impact: 5, level: 'CRITICAL' },
      { likelihood: 1, impact: 1, level: 'LOW' },
      { likelihood: 4, impact: 5, level: 'CRITICAL' },
    ]);
    const r = await service.heatMap('t1');
    expect(r.total).toBe(3);
    expect(r.grid[3][4]).toBe(2); // likelihood 4, impact 5
    expect(r.grid[0][0]).toBe(1);
    expect(r.byLevel.CRITICAL).toBe(2);
  });
});
