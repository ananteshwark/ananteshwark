import { NotFoundException } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { ObjectiveStatus } from './entities/objective.entity';
import { KrStatus } from './entities/key-result.entity';

/**
 * OKRs: key-result progress math (capped at 100, ACHIEVED at target) and the
 * objective rollup with its ON_TRACK / AT_RISK / BEHIND thresholds.
 */
describe('GoalsService', () => {
  let service: GoalsService;
  let cycleRepo: any, objectiveRepo: any, krRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    cycleRepo = mockRepo(); objectiveRepo = mockRepo(); krRepo = mockRepo();
    service = new GoalsService(cycleRepo, objectiveRepo, krRepo);
  });

  const kr = (over: any = {}) => ({
    id: 'kr1', tenantId: 't1', objectiveId: 'o1', targetValue: 100, currentValue: 0, progress: 0, ...over,
  });

  it('updateKeyResultProgress computes percent and caps at 100 / ACHIEVED', async () => {
    krRepo.findOne.mockResolvedValue(kr());
    krRepo.find.mockResolvedValue([{ progress: 60 }]);
    const half = await service.updateKeyResultProgress('t1', 'kr1', { currentValue: 60 } as any);
    expect(half.progress).toBe(60);

    krRepo.findOne.mockResolvedValue(kr());
    const over = await service.updateKeyResultProgress('t1', 'kr1', { currentValue: 150 } as any);
    expect(over.progress).toBe(100);
    expect(over.status).toBe(KrStatus.ACHIEVED);
  });

  it.each([
    [100, ObjectiveStatus.ACHIEVED],
    [75, ObjectiveStatus.ON_TRACK],
    [50, ObjectiveStatus.AT_RISK],
    [20, ObjectiveStatus.BEHIND],
  ])('objective rollup at %i%% avg → %s', async (avg, expected) => {
    krRepo.findOne.mockResolvedValue(kr({ targetValue: 100 }));
    krRepo.find.mockResolvedValue([{ progress: avg }, { progress: avg }]);
    await service.updateKeyResultProgress('t1', 'kr1', { currentValue: 1 } as any);
    expect(objectiveRepo.update).toHaveBeenCalledWith(
      { id: 'o1', tenantId: 't1' },
      { progress: avg, status: expected },
    );
  });

  it('404s on an unknown key result', async () => {
    await expect(service.updateKeyResultProgress('t1', 'ghost', { currentValue: 1 } as any)).rejects.toThrow(NotFoundException);
  });

  it('getDashboard aggregates objective statuses and average progress', async () => {
    objectiveRepo.find.mockResolvedValue([
      { status: ObjectiveStatus.ACHIEVED, progress: 100 },
      { status: ObjectiveStatus.AT_RISK, progress: 50 },
    ]);
    krRepo.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{}, {}, {}]),
    });
    const d = await service.getDashboard('t1', 'cy1');
    expect(d).toMatchObject({ totalObjectives: 2, achieved: 1, atRisk: 1, avgProgress: 75, totalKeyResults: 3 });
  });
});
