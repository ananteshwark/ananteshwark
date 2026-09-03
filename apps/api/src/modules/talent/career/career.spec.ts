import { BadRequestException } from '@nestjs/common';
import { CareerService } from './career.service';
import { CareerPathType } from './entities/career-architecture.entity';
import { TalentPoolType, PoolMemberStatus } from './entities/talent-pool.entity';
import { TalentReviewStatus, Rating3 } from './entities/talent-review.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('CareerService', () => {
  let service: CareerService;
  let familyRepo: any, ladderRepo: any, pathRepo: any, poolRepo: any, memberRepo: any, reviewRepo: any, placementRepo: any, automation: any;

  beforeEach(() => {
    familyRepo = mockRepo(); ladderRepo = mockRepo(); pathRepo = mockRepo();
    poolRepo = mockRepo(); memberRepo = mockRepo(); reviewRepo = mockRepo(); placementRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new CareerService(familyRepo, ladderRepo, pathRepo, poolRepo, memberRepo, reviewRepo, placementRepo, automation);
  });

  describe('computeBox', () => {
    it('maps high/high to box 9 (Star) and low/low to box 1', () => {
      expect(CareerService.computeBox(Rating3.HIGH, Rating3.HIGH)).toEqual({ box: 9, boxLabel: 'Star' });
      expect(CareerService.computeBox(Rating3.LOW, Rating3.LOW)).toEqual({ box: 1, boxLabel: 'Underperformer' });
      // high performance, low potential → trusted professional (box 3)
      expect(CareerService.computeBox(Rating3.HIGH, Rating3.LOW)).toEqual({ box: 3, boxLabel: 'Trusted Professional' });
      // low performance, high potential → rough diamond (box 7)
      expect(CareerService.computeBox(Rating3.LOW, Rating3.HIGH)).toEqual({ box: 7, boxLabel: 'Rough Diamond' });
    });
  });

  describe('career architecture', () => {
    it('creates a job family and rejects duplicate codes', async () => {
      const fam = await service.createJobFamily('t1', { code: 'ENG', name: 'Engineering' });
      expect(fam).toMatchObject({ code: 'ENG', name: 'Engineering', active: true });
      familyRepo.findOne.mockResolvedValue({ id: 'f1', code: 'ENG' });
      await expect(service.createJobFamily('t1', { code: 'ENG', name: 'Engineering' })).rejects.toThrow(BadRequestException);
    });

    it('normalises & sorts ladder rungs by level', async () => {
      familyRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1' });
      const ladder = await service.createLadder('t1', {
        jobFamilyId: 'f1', name: 'IC Track',
        rungs: [{ level: 2, title: 'Engineer II' }, { level: 1, title: ' Engineer I ' }, { level: 3, title: '  ' }],
      });
      expect(ladder.rungs.map((r) => r.level)).toEqual([1, 2]);
      expect(ladder.rungs[0].title).toBe('Engineer I');
    });

    it('resolves next moves to target titles', async () => {
      pathRepo.find.mockResolvedValue([{ id: 'p1', toLadderId: 'l2', toLevel: 3, fromLadderId: 'l1', fromLevel: 2, pathType: CareerPathType.VERTICAL }]);
      ladderRepo.findOne.mockResolvedValue({ id: 'l2', name: 'Senior Track', rungs: [{ level: 3, title: 'Staff Engineer' }] });
      const moves = await service.nextMoves('t1', 'l1', 2);
      expect(moves).toHaveLength(1);
      expect(moves[0]).toMatchObject({ toLadderName: 'Senior Track', toTitle: 'Staff Engineer' });
    });
  });

  describe('talent pools', () => {
    it('nominates a member and emits an event', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 'pool1', tenantId: 't1' });
      memberRepo.findOne.mockResolvedValue(null);
      const member = await service.nominateMember('t1', 'pool1', { employeeId: 'e1', employeeName: 'Ann', readiness: 'READY_NOW' });
      expect(member).toMatchObject({ poolId: 'pool1', status: PoolMemberStatus.NOMINATED });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'talent_pool.nominated', expect.objectContaining({ employeeId: 'e1' }));
    });

    it('rejects a duplicate active membership', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 'pool1', tenantId: 't1' });
      memberRepo.findOne.mockResolvedValue({ id: 'm1', status: PoolMemberStatus.ACTIVE });
      await expect(service.nominateMember('t1', 'pool1', { employeeId: 'e1', employeeName: 'Ann' })).rejects.toThrow(BadRequestException);
    });

    it('reports bench coverage vs target with a readiness breakdown', async () => {
      poolRepo.findOne.mockResolvedValue({ id: 'pool1', tenantId: 't1', name: 'CFO bench', type: TalentPoolType.SUCCESSOR, targetSize: 3 });
      memberRepo.find.mockResolvedValue([
        { readiness: 'READY_NOW', status: PoolMemberStatus.ACTIVE },
        { readiness: 'READY_1_2Y', status: PoolMemberStatus.NOMINATED },
        { readiness: 'READY_NOW', status: PoolMemberStatus.EXITED }, // excluded
      ]);
      const cov = await service.poolCoverage('t1', 'pool1');
      expect(cov).toMatchObject({ activeMembers: 2, readyNow: 1, coverageGap: 1 });
      expect(cov.readinessBreakdown).toEqual({ READY_NOW: 1, READY_1_2Y: 1 });
    });
  });

  describe('talent reviews (9-box)', () => {
    it('places an employee and derives the box', async () => {
      reviewRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TalentReviewStatus.IN_CALIBRATION });
      placementRepo.findOne.mockResolvedValue(null);
      const p = await service.placeEmployee('t1', 'r1', { employeeId: 'e1', employeeName: 'Ann', performance: Rating3.HIGH, potential: Rating3.HIGH });
      expect(p).toMatchObject({ box: 9, boxLabel: 'Star' });
    });

    it('blocks placement edits on a finalized review', async () => {
      reviewRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TalentReviewStatus.FINALIZED });
      await expect(service.placeEmployee('t1', 'r1', { employeeId: 'e1', employeeName: 'Ann', performance: Rating3.HIGH, potential: Rating3.HIGH }))
        .rejects.toThrow(BadRequestException);
    });

    it('computes a full 9-box distribution', async () => {
      reviewRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1' });
      placementRepo.find.mockResolvedValue([{ box: 9 }, { box: 9 }, { box: 5 }]);
      const dist = await service.distribution('t1', 'r1');
      expect(dist).toHaveLength(9);
      expect(dist.find((d) => d.box === 9)!.count).toBe(2);
      expect(dist.find((d) => d.box === 5)!.count).toBe(1);
      // reversed so box 9 comes first
      expect(dist[0].box).toBe(9);
    });

    it('finalizes and flows box≥8 talent into the HiPo pool, emitting an event', async () => {
      reviewRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', name: 'Q3 Review', status: TalentReviewStatus.IN_CALIBRATION, hipoPoolId: 'pool1' });
      placementRepo.find.mockResolvedValue([
        { employeeId: 'e1', employeeName: 'Ann', box: 9, boxLabel: 'Star' },
        { employeeId: 'e2', employeeName: 'Bob', box: 8, boxLabel: 'High Potential' },
        { employeeId: 'e3', employeeName: 'Cid', box: 5, boxLabel: 'Core Player' },
      ]);
      memberRepo.findOne.mockResolvedValue(null);
      const { review, promotedToPool } = await service.finalize('t1', 'r1');
      expect(review.status).toBe(TalentReviewStatus.FINALIZED);
      expect(review.finalizedAt).toBeInstanceOf(Date);
      expect(promotedToPool).toBe(2);
      expect(memberRepo.save).toHaveBeenCalledTimes(2);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'talent_review.finalized', expect.objectContaining({ promotedToPool: 2 }));
    });

    it('refuses to finalize an already finalized review', async () => {
      reviewRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TalentReviewStatus.FINALIZED });
      await expect(service.finalize('t1', 'r1')).rejects.toThrow(BadRequestException);
    });
  });
});
