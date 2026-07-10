import { BadRequestException } from '@nestjs/common';
import { MsfService } from './msf.service';
import { PromotionService } from './promotion.service';
import { MsfStatus, RaterRelationship, RaterStatus } from './entities/msf-campaign.entity';
import { PromotionStatus } from './entities/promotion.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('MsfService', () => {
  let service: MsfService;
  let campaignRepo: any, raterRepo: any, responseRepo: any, automation: any;

  beforeEach(() => {
    campaignRepo = mockRepo(); raterRepo = mockRepo(); responseRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new MsfService(campaignRepo, raterRepo, responseRepo, automation);
  });

  const campaign = (over: any = {}) => ({
    id: 'c1', tenantId: 't1', name: '360 for Ann', subjectEmployeeId: 'e1', subjectName: 'Ann',
    status: MsfStatus.COLLECTING, ratingScaleMax: 5, anonymityThreshold: 3,
    competencies: [{ key: 'collab', label: 'Collaboration' }, { key: 'lead', label: 'Leadership' }], ...over,
  });

  it('launches only from DRAFT with competencies and raters', async () => {
    campaignRepo.findOne.mockResolvedValue(campaign({ status: MsfStatus.DRAFT }));
    raterRepo.find.mockResolvedValue([{ id: 'r1' }]);
    const launched = await service.launch('t1', 'c1');
    expect(launched.status).toBe(MsfStatus.COLLECTING);
  });

  it('blocks launch with no raters', async () => {
    campaignRepo.findOne.mockResolvedValue(campaign({ status: MsfStatus.DRAFT }));
    raterRepo.find.mockResolvedValue([]);
    await expect(service.launch('t1', 'c1')).rejects.toThrow(BadRequestException);
  });

  it('submits a response, filtering invalid competency keys and marking the rater SUBMITTED', async () => {
    raterRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', campaignId: 'c1', relationship: RaterRelationship.PEER, status: RaterStatus.INVITED });
    campaignRepo.findOne.mockResolvedValue(campaign());
    const resp = await service.submitResponse('t1', 'r1', { ratings: [{ competencyKey: 'collab', score: 4 }, { competencyKey: 'bogus', score: 5 }], strengths: 'Great' });
    expect(resp.ratings).toEqual([{ competencyKey: 'collab', score: 4 }]);
    expect(raterRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: RaterStatus.SUBMITTED }));
  });

  it('rejects an out-of-range score', async () => {
    raterRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', campaignId: 'c1', relationship: RaterRelationship.PEER, status: RaterStatus.INVITED });
    campaignRepo.findOne.mockResolvedValue(campaign());
    await expect(service.submitResponse('t1', 'r1', { ratings: [{ competencyKey: 'collab', score: 9 }] })).rejects.toThrow(BadRequestException);
  });

  it('closes a campaign and emits msf.closed', async () => {
    campaignRepo.findOne.mockResolvedValue(campaign());
    responseRepo.find.mockResolvedValue([{}, {}]);
    const closed = await service.close('t1', 'c1');
    expect(closed.status).toBe(MsfStatus.CLOSED);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'msf.closed', expect.objectContaining({ responses: 2 }));
  });

  describe('report', () => {
    it('computes self-vs-others gaps and suppresses thin relationship groups', async () => {
      campaignRepo.findOne.mockResolvedValue(campaign({ anonymityThreshold: 2 }));
      responseRepo.find.mockResolvedValue([
        { relationship: RaterRelationship.SELF, ratings: [{ competencyKey: 'collab', score: 5 }], strengths: 'x' },
        { relationship: RaterRelationship.PEER, ratings: [{ competencyKey: 'collab', score: 3 }] },
        { relationship: RaterRelationship.PEER, ratings: [{ competencyKey: 'collab', score: 3 }] },
        { relationship: RaterRelationship.MANAGER, ratings: [{ competencyKey: 'collab', score: 2 }] }, // 1 rater < threshold → suppressed
      ]);
      const rep = await service.report('t1', 'c1');
      const collab = rep.competencies.find((c) => c.key === 'collab')!;
      expect(collab.selfScore).toBe(5);
      expect(collab.othersAvg).toBe(round2Approx(8 / 3)); // (3+3+2)/3
      expect(collab.gap).toBeCloseTo(5 - 8 / 3, 1); // blind spot: self higher than others
      const mgr = collab.byRelationship.find((r) => r.relationship === RaterRelationship.MANAGER)!;
      expect(mgr.suppressed).toBe(true);
      expect(mgr.avg).toBeNull();
      const peer = collab.byRelationship.find((r) => r.relationship === RaterRelationship.PEER)!;
      expect(peer.avg).toBe(3);
      expect(rep.strengths).toEqual(['x']);
    });
  });
});

function round2Approx(n: number) { return Math.round(n * 100) / 100; }

describe('PromotionService', () => {
  let service: PromotionService;
  let caseRepo: any, matrixRepo: any, automation: any;

  beforeEach(() => {
    caseRepo = mockRepo(); matrixRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new PromotionService(caseRepo, matrixRepo, automation);
  });

  describe('computeReadiness', () => {
    it('normalises weighted criteria to 0–100', () => {
      // (2*(4/5) + 1*(3/5)) / 3 * 100 = (1.6+0.6)/3*100 = 73.33
      expect(PromotionService.computeReadiness([
        { weight: 2, score: 4, maxScore: 5 },
        { weight: 1, score: 3, maxScore: 5 },
      ])).toBeCloseTo(73.33, 1);
    });
    it('returns null with no valid criteria', () => {
      expect(PromotionService.computeReadiness([])).toBeNull();
      expect(PromotionService.computeReadiness([{ weight: 0, score: 5, maxScore: 5 }])).toBeNull();
    });
  });

  it('creates a case with a computed readiness score', async () => {
    const c = await service.createCase('t1', { employeeId: 'e1', employeeName: 'Ann', criteria: [{ key: 'perf', label: 'Perf', weight: 1, score: 5, maxScore: 5 }] });
    expect(c.readinessScore).toBe(100);
    expect(c.status).toBe(PromotionStatus.DRAFT);
  });

  it('walks DRAFT → IN_REVIEW → APPROVED and emits promotion.decided', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: PromotionStatus.DRAFT, criteria: [{ key: 'perf', weight: 1, score: 5, maxScore: 5 }], employeeId: 'e1' });
    const reviewed = await service.submitForReview('t1', 'p1');
    expect(reviewed.status).toBe(PromotionStatus.IN_REVIEW);

    caseRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: PromotionStatus.IN_REVIEW, employeeId: 'e1', toLevel: 'L5' });
    const decided = await service.decide('t1', 'p1', { approve: true, decidedByUserId: 'u1', recommendation: 'Promote' });
    expect(decided.status).toBe(PromotionStatus.APPROVED);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'promotion.decided', expect.objectContaining({ decision: PromotionStatus.APPROVED }));
  });

  it('refuses to decide a case not in review', async () => {
    caseRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: PromotionStatus.DRAFT });
    await expect(service.decide('t1', 'p1', { approve: true, decidedByUserId: 'u1' })).rejects.toThrow(BadRequestException);
  });

  describe('achievement matrix (N-grid)', () => {
    it('resolves a cell recommendation for a placement', async () => {
      matrixRepo.findOne.mockResolvedValue({
        id: 'm1', tenantId: 't1', rowBands: ['Low', 'High'], colBands: ['Low', 'High'],
        cells: { 'High|High': { recommendation: 'Accelerate' } },
      });
      const res = await service.placeOnMatrix('t1', 'm1', 'High', 'High');
      expect(res.recommendation).toBe('Accelerate');
    });

    it('rejects an undefined band', async () => {
      matrixRepo.findOne.mockResolvedValue({ id: 'm1', tenantId: 't1', rowBands: ['Low'], colBands: ['Low'], cells: {} });
      await expect(service.placeOnMatrix('t1', 'm1', 'Nope', 'Low')).rejects.toThrow(BadRequestException);
    });
  });
});
