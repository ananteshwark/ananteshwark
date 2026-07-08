import { PredictiveService } from './predictive.service';
import { PredictiveModel } from './entities/predictive-score.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn((x: any) => Promise.resolve(x)),
  create: jest.fn((x: any) => x),
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe('PredictiveService — attrition risk', () => {
  let service: PredictiveService;
  let scoreRepo: any, employeeRepo: any, transferRepo: any, leaveRepo: any;

  beforeEach(() => {
    scoreRepo = mockRepo();
    employeeRepo = mockRepo();
    transferRepo = mockRepo();
    leaveRepo = mockRepo();
    service = new (PredictiveService as any)(scoreRepo, employeeRepo, transferRepo, leaveRepo);
  });

  it('scores stagnant mid-tenure employees far above fresh movers, ranked desc', async () => {
    employeeRepo.find.mockResolvedValue([
      { id: 'stagnant', status: 'ACTIVE', dateOfJoining: daysAgo(900) },   // 2.5y tenure, never moved
      { id: 'mover', status: 'ACTIVE', dateOfJoining: daysAgo(900) },     // same tenure but promoted recently
      { id: 'veteran', status: 'ACTIVE', dateOfJoining: daysAgo(7 * 365) },
    ]);
    transferRepo.find.mockResolvedValue([
      { employeeId: 'mover', effectiveDate: daysAgo(60) },
    ]);
    const results = await service.scoreAttrition('t1');
    const byId = new Map(results.map((r: any) => [r.subjectId, r]));

    const stagnant: any = byId.get('stagnant');
    const mover: any = byId.get('mover');
    const veteran: any = byId.get('veteran');
    // stagnant: 1–3y window (30) + no move in 24m (35) = 65
    expect(stagnant.score).toBe(65);
    expect(stagnant.factors.map((f: any) => f.factor)).toEqual(expect.arrayContaining([
      expect.stringContaining('1–3 year'), expect.stringContaining('No role change'),
    ]));
    // mover: only the tenure-band factor (30)
    expect(mover.score).toBe(30);
    // veteran with no move: long tenure (5) + stagnation (35) = 40
    expect(veteran.score).toBe(40);
    // sorted highest risk first
    expect(results[0].subjectId).toBe('stagnant');
  });

  it('adds a leave-spike factor for heavy recent leave', async () => {
    employeeRepo.find.mockResolvedValue([
      { id: 'e1', status: 'ACTIVE', dateOfJoining: daysAgo(400) },
    ]);
    leaveRepo.find.mockResolvedValue([
      { employeeId: 'e1', toDate: daysAgo(10), days: 6, status: 'APPROVED' },
      { employeeId: 'e1', toDate: daysAgo(40), days: 5, status: 'APPROVED' },
      { employeeId: 'e1', toDate: daysAgo(200), days: 20, status: 'APPROVED' }, // outside 90d window
    ]);
    const [result]: any = await service.scoreAttrition('t1');
    expect(result.factors.some((f: any) => f.factor.includes('High recent leave (11 days'))).toBe(true);
    expect(result.score).toBe(50); // 30 tenure band + 20 leave spike
  });

  it('persists under the ATTRITION_RISK model and returns empty for no employees', async () => {
    employeeRepo.find.mockResolvedValue([]);
    expect(await service.scoreAttrition('t1')).toEqual([]);

    employeeRepo.find.mockResolvedValue([{ id: 'e1', status: 'ACTIVE', dateOfJoining: daysAgo(100) }]);
    await service.scoreAttrition('t1');
    expect(scoreRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      model: PredictiveModel.ATTRITION_RISK, subjectId: 'e1',
    }));
  });
});
