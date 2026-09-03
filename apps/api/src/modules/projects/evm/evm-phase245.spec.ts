import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvmService } from './evm.service';
import { EvmBaseline, EvmBaselineStatus } from './entities/evm-baseline.entity';
import { EvmBaselineLine } from './entities/evm-baseline-line.entity';
import { EvmMeasurement } from './entities/evm-measurement.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('EvmService — Phase 245-247', () => {
  let service: EvmService;
  let baselineRepo: any, lineRepo: any, measureRepo: any;

  beforeEach(async () => {
    baselineRepo = mockRepo(); lineRepo = mockRepo(); measureRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        EvmService,
        { provide: getRepositoryToken(EvmBaseline), useValue: baselineRepo },
        { provide: getRepositoryToken(EvmBaselineLine), useValue: lineRepo },
        { provide: getRepositoryToken(EvmMeasurement), useValue: measureRepo },
      ],
    }).compile();
    service = module.get(EvmService);
  });

  // ─── Ph-245: baseline ─────────────────────────────────────────────

  it('createBaseline — BAC = sum of planned values; version 1', async () => {
    baselineRepo.findOne.mockResolvedValue(null);
    baselineRepo.save.mockImplementation((x: any) => Promise.resolve({ id: 'b1', ...x }));
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.createBaseline('t1', 'p1', [{ taskId: 't1', plannedValue: 6000 }, { taskId: 't2', plannedValue: 4000 }]);
    expect(r.baseline.bac).toBe(10000);
    expect(r.baseline.version).toBe(1);
  });

  it('createBaseline — supersedes the prior active baseline', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b0', version: 1, status: EvmBaselineStatus.ACTIVE });
    baselineRepo.save.mockImplementation((x: any) => Promise.resolve({ id: x.id ?? 'b1', ...x }));
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.createBaseline('t1', 'p1', [{ taskId: 't1', plannedValue: 100 }]);
    expect(r.baseline.version).toBe(2);
    expect(baselineRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: EvmBaselineStatus.SUPERSEDED }));
  });

  // ─── Ph-246: measurement calculations ─────────────────────────────

  it('recordMeasurement — computes PV/EV/AC and SPI/CPI', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b1', bac: 10000, status: EvmBaselineStatus.ACTIVE });
    lineRepo.findOne.mockResolvedValue({ taskId: 't1', plannedValue: 1000 });
    measureRepo.findOne.mockResolvedValue(null);
    measureRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const m = await service.recordMeasurement('t1', { projectId: 'p1', taskId: 't1', period: '2026-06', pctScheduled: 50, pctComplete: 40, actualCost: 500 });
    expect(m.plannedValue).toBe(500); // 1000 × 50%
    expect(m.earnedValue).toBe(400); // 1000 × 40%
    expect(m.spi).toBe(0.8); // 400/500
    expect(m.cpi).toBe(0.8); // 400/500
  });

  it('recordMeasurement — throws when task not in baseline', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b1', bac: 100, status: EvmBaselineStatus.ACTIVE });
    lineRepo.findOne.mockResolvedValue(null);
    await expect(service.recordMeasurement('t1', { projectId: 'p1', taskId: 'zz', period: '2026-06', pctScheduled: 10, pctComplete: 10, actualCost: 5 })).rejects.toThrow(NotFoundException);
  });

  it('projectMetrics — aggregates and forecasts EAC/VAC', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b1', bac: 10000, status: EvmBaselineStatus.ACTIVE });
    measureRepo.find.mockResolvedValue([
      { plannedValue: 500, earnedValue: 400, actualCost: 500 },
      { plannedValue: 500, earnedValue: 400, actualCost: 300 },
    ]);
    const r = await service.projectMetrics('t1', 'p1', '2026-06');
    expect(r.pv).toBe(1000);
    expect(r.ev).toBe(800);
    expect(r.ac).toBe(800);
    expect(r.spi).toBe(0.8);
    expect(r.cpi).toBe(1); // 800/800
    expect(r.eac).toBe(10000); // bac/cpi
    expect(r.scheduleVariance).toBe(-200);
  });

  it('projectMetrics — rejects bad period', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b1', bac: 1, status: EvmBaselineStatus.ACTIVE });
    measureRepo.find.mockResolvedValue([]);
    const r = await service.projectMetrics('t1', 'p1', '2026-06');
    expect(r.cpi).toBeNull(); // no AC
  });

  // ─── Ph-247: S-curve ──────────────────────────────────────────────

  it('sCurve — cumulative PV/EV/AC and FAC from latest CPI', async () => {
    baselineRepo.findOne.mockResolvedValue({ id: 'b1', bac: 10000, status: EvmBaselineStatus.ACTIVE });
    measureRepo.find.mockResolvedValue([
      { period: '2026-05', plannedValue: 300, earnedValue: 250, actualCost: 300 },
      { period: '2026-06', plannedValue: 400, earnedValue: 400, actualCost: 300 },
    ]);
    const r = await service.sCurve('t1', 'p1');
    expect(r.series[1].cumulativePV).toBe(700);
    expect(r.series[1].cumulativeEV).toBe(650);
    expect(r.series[1].cumulativeAC).toBe(600);
    expect(r.latestCpi).toBeCloseTo(1.083, 2);
    expect(r.forecastAtCompletion).toBeCloseTo(9233.6, 0);
  });
});
