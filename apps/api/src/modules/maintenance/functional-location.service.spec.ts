import { FunctionalLocationService } from './functional-location.service';

/**
 * Functional locations: parent/child tree assembly, and counter readings
 * driving COUNTER-triggered maintenance plans — baseline on first reading,
 * roll-forward past multiple intervals, counter-type filtering, dedup.
 */
describe('FunctionalLocationService', () => {
  let service: FunctionalLocationService;
  let flocRepo: any, readingRepo: any, planRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    flocRepo = mockRepo(); readingRepo = mockRepo(); planRepo = mockRepo();
    service = new FunctionalLocationService(flocRepo, readingRepo, planRepo);
  });

  it('getTree nests children under parents and floats orphans as roots', async () => {
    flocRepo.find.mockResolvedValue([
      { id: 'plant', code: 'PL', parentId: null },
      { id: 'line1', code: 'PL-L1', parentId: 'plant' },
      { id: 'orphan', code: 'X', parentId: 'ghost-parent' },
    ]);
    const tree = await service.getTree('t1');
    expect(tree.map((n: any) => n.id).sort()).toEqual(['orphan', 'plant']);
    expect(tree.find((n: any) => n.id === 'plant')!.children[0].id).toBe('line1');
  });

  it('the first counter reading baselines nextDueCounter without firing', async () => {
    const plan: any = { id: 'p1', triggerType: 'COUNTER', counterInterval: 500, counterType: 'KM', nextDueCounter: null };
    planRepo.find.mockResolvedValue([plan]);
    const { duePlans } = await service.recordCounterReading('t1', 'eq1', { counterType: 'KM', reading: 1000 } as any, 'u1');
    expect(plan.nextDueCounter).toBe(1500); // baseline = reading + interval
    expect(duePlans).toHaveLength(0);
  });

  it('a reading past the due counter fires the plan and rolls the counter forward', async () => {
    const plan: any = { id: 'p1', triggerType: 'COUNTER', counterInterval: 500, counterType: 'KM', nextDueCounter: 1500 };
    planRepo.find.mockResolvedValue([plan]);
    // 2600 passes 1500 and 2000 and 2500 → due (deduped to one), next due 3000
    const { duePlans } = await service.recordCounterReading('t1', 'eq1', { counterType: 'KM', reading: 2600 } as any, 'u1');
    expect(duePlans).toHaveLength(1);
    expect(plan.nextDueCounter).toBe(3000);
    expect(plan.lastCounterReading).toBe(2600);
  });

  it('readings only affect plans of the matching counter type', async () => {
    const kmPlan: any = { id: 'p1', triggerType: 'COUNTER', counterInterval: 500, counterType: 'KM', nextDueCounter: 100 };
    const hrPlan: any = { id: 'p2', triggerType: 'COUNTER', counterInterval: 100, counterType: 'HOURS', nextDueCounter: 100 };
    planRepo.find.mockResolvedValue([kmPlan, hrPlan]);
    const { duePlans } = await service.recordCounterReading('t1', 'eq1', { counterType: 'KM', reading: 200 } as any, 'u1');
    expect(duePlans.map((p: any) => p.id)).toEqual(['p1']);
    expect(hrPlan.nextDueCounter).toBe(100); // untouched
  });

  it('time-based plans are ignored by counter readings', async () => {
    const timePlan: any = { id: 'p1', triggerType: 'TIME', counterInterval: null };
    planRepo.find.mockResolvedValue([timePlan]);
    const { duePlans } = await service.recordCounterReading('t1', 'eq1', { counterType: 'KM', reading: 999 } as any, 'u1');
    expect(duePlans).toHaveLength(0);
    expect(planRepo.save).not.toHaveBeenCalled();
  });
});
