import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HeadcountService } from './headcount.service';
import { PositionBudget } from './entities/position-budget.entity';
import { WorkforceScenario, ScenarioStatus } from './entities/workforce-scenario.entity';
import { Position } from '../employees/entities/position.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('HeadcountService — Phase 191-193', () => {
  let service: HeadcountService;
  let budgetRepo: any, scenarioRepo: any, positionRepo: any;

  beforeEach(async () => {
    budgetRepo = mockRepo(); scenarioRepo = mockRepo(); positionRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        HeadcountService,
        { provide: getRepositoryToken(PositionBudget), useValue: budgetRepo },
        { provide: getRepositoryToken(WorkforceScenario), useValue: scenarioRepo },
        { provide: getRepositoryToken(Position), useValue: positionRepo },
      ],
    }).compile();
    service = module.get(HeadcountService);
  });

  // ─── Ph-191: budgeting ────────────────────────────────────────────

  it('createBudget — throws when position missing', async () => {
    positionRepo.findOne.mockResolvedValue(null);
    await expect(service.createBudget('t1', { positionId: 'nope', fiscalYear: 2026, approvedFte: 2 })).rejects.toThrow(NotFoundException);
  });

  it('createBudget — rejects salary max below min', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1' });
    await expect(service.createBudget('t1', { positionId: 'p1', fiscalYear: 2026, approvedFte: 2, salaryMin: 100, salaryMax: 50 })).rejects.toThrow(BadRequestException);
  });

  it('createBudget — rejects duplicate fiscal-year budget', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1' });
    budgetRepo.findOne.mockResolvedValue({ id: 'b1' });
    await expect(service.createBudget('t1', { positionId: 'p1', fiscalYear: 2026, approvedFte: 2 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-192: headcount control ────────────────────────────────────

  it('checkHeadcount — OK when within approved FTE', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', status: 'OPEN', filledHeadcount: 2, budgetedHeadcount: 3 });
    budgetRepo.findOne.mockResolvedValue({ approvedFte: 5 });
    const r = await service.checkHeadcount('t1', 'p1', 2026, 1);
    expect(r.severity).toBe('OK');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);
  });

  it('checkHeadcount — BLOCK when exceeding approved FTE', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', status: 'OPEN', filledHeadcount: 5, budgetedHeadcount: 5 });
    budgetRepo.findOne.mockResolvedValue({ approvedFte: 5 });
    const r = await service.checkHeadcount('t1', 'p1', 2026, 1);
    expect(r.severity).toBe('BLOCK');
    expect(r.allowed).toBe(false);
  });

  it('checkHeadcount — WARN when no fiscal-year budget defined', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', status: 'OPEN', filledHeadcount: 1, budgetedHeadcount: 4 });
    budgetRepo.findOne.mockResolvedValue(null);
    const r = await service.checkHeadcount('t1', 'p1', 2026, 1);
    expect(r.severity).toBe('WARN');
    expect(r.usedFallback).toBe(true);
  });

  it('checkHeadcount — BLOCK when position frozen', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', status: 'FROZEN', filledHeadcount: 0, budgetedHeadcount: 5 });
    budgetRepo.findOne.mockResolvedValue({ approvedFte: 5 });
    const r = await service.checkHeadcount('t1', 'p1', 2026, 1);
    expect(r.severity).toBe('BLOCK');
  });

  it('validateHire — throws on BLOCK', async () => {
    positionRepo.findOne.mockResolvedValue({ id: 'p1', status: 'OPEN', filledHeadcount: 5, budgetedHeadcount: 5 });
    budgetRepo.findOne.mockResolvedValue({ approvedFte: 5 });
    await expect(service.validateHire('t1', 'p1', 2026, 1)).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-193: scenarios ────────────────────────────────────────────

  it('addChange — rejects edits on non-DRAFT scenario', async () => {
    scenarioRepo.findOne.mockResolvedValue({ id: 's1', status: ScenarioStatus.FINALIZED, changes: [] });
    await expect(service.addChange('t1', 's1', { positionId: 'p1', action: 'ADD', deltaFte: 1 })).rejects.toThrow(BadRequestException);
  });

  it('project — computes baseline + deltas without mutating live data', async () => {
    scenarioRepo.findOne.mockResolvedValue({
      id: 's1', name: 'Reorg', scenarioType: 'RESTRUCTURE', status: ScenarioStatus.DRAFT,
      changes: [{ positionId: 'p1', action: 'ADD', deltaFte: 2 }, { positionId: 'p2', action: 'REMOVE', deltaFte: -1 }],
    });
    positionRepo.find.mockResolvedValue([
      { id: 'p1', title: 'Eng', filledHeadcount: 3 },
      { id: 'p2', title: 'Sales', filledHeadcount: 4 },
    ]);
    const r = await service.project('t1', 's1');
    expect(r.baselineTotal).toBe(7);
    expect(r.projectedTotal).toBe(8); // (3+2) + (4-1)
    expect(r.netChange).toBe(1);
    expect(positionRepo.save).not.toHaveBeenCalled();
  });

  it('finalize — locks a DRAFT scenario', async () => {
    scenarioRepo.findOne.mockResolvedValue({ id: 's1', status: ScenarioStatus.DRAFT });
    scenarioRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.finalize('t1', 's1');
    expect(r.status).toBe(ScenarioStatus.FINALIZED);
  });
});
