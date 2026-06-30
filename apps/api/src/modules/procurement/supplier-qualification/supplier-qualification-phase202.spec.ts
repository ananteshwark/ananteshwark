import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SupplierQualificationService } from './supplier-qualification.service';
import { Questionnaire } from './entities/questionnaire.entity';
import { QuestionnaireResponse, ResponseStatus } from './entities/questionnaire-response.entity';
import { SupplierCertificate } from './entities/supplier-certificate.entity';
import { SupplierScorecard } from './entities/supplier-scorecard.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('SupplierQualificationService — Phase 202-205', () => {
  let service: SupplierQualificationService;
  let qRepo: any, respRepo: any, certRepo: any, scoreRepo: any;

  beforeEach(async () => {
    qRepo = mockRepo(); respRepo = mockRepo(); certRepo = mockRepo(); scoreRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        SupplierQualificationService,
        { provide: getRepositoryToken(Questionnaire), useValue: qRepo },
        { provide: getRepositoryToken(QuestionnaireResponse), useValue: respRepo },
        { provide: getRepositoryToken(SupplierCertificate), useValue: certRepo },
        { provide: getRepositoryToken(SupplierScorecard), useValue: scoreRepo },
      ],
    }).compile();
    service = module.get(SupplierQualificationService);
  });

  // ─── Ph-202: questionnaires ───────────────────────────────────────

  it('createQuestionnaire — requires questions', async () => {
    await expect(service.createQuestionnaire('t1', { name: 'ISO', questions: [] })).rejects.toThrow(BadRequestException);
  });

  it('createQuestionnaire — defaults weights and threshold', async () => {
    await service.createQuestionnaire('t1', { name: 'Q', questions: [{ id: 'q1', text: 'ISO?', type: 'BOOLEAN', passValue: true } as any] });
    expect(qRepo.create).toHaveBeenCalledWith(expect.objectContaining({ passThresholdPct: 70 }));
    expect(qRepo.create.mock.calls[0][0].questions[0].weight).toBe(1);
  });

  // ─── Ph-203: responses + auto-score ───────────────────────────────

  const sampleQ = {
    id: 'qq', passThresholdPct: 70,
    questions: [
      { id: 'q1', text: 'ISO 9001?', type: 'BOOLEAN', weight: 2, passValue: true },
      { id: 'q2', text: 'Years in business', type: 'NUMERIC', weight: 1, passValue: 5 },
      { id: 'q3', text: 'Region', type: 'CHOICE', weight: 1, passValue: 'APAC' },
    ],
  };

  it('submitResponse — PASSED when weighted score meets threshold', async () => {
    qRepo.findOne.mockResolvedValue(sampleQ);
    respRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.submitResponse('t1', { questionnaireId: 'qq', supplierId: 's1', answers: [
      { questionId: 'q1', value: true }, { questionId: 'q2', value: 10 }, { questionId: 'q3', value: 'EMEA' },
    ] });
    // pass q1(2)+q2(1)=3 of 4 → 75% ≥ 70
    expect(r.scorePct).toBe(75);
    expect(r.status).toBe(ResponseStatus.PASSED);
    expect(r.failedQuestions).toEqual(['q3']);
  });

  it('submitResponse — REVIEW when below threshold', async () => {
    qRepo.findOne.mockResolvedValue(sampleQ);
    respRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.submitResponse('t1', { questionnaireId: 'qq', supplierId: 's1', answers: [
      { questionId: 'q1', value: false }, { questionId: 'q2', value: 10 }, { questionId: 'q3', value: 'APAC' },
    ] });
    // pass q2(1)+q3(1)=2 of 4 → 50% < 70
    expect(r.scorePct).toBe(50);
    expect(r.status).toBe(ResponseStatus.REVIEW);
  });

  it('reviewResponse — approves a REVIEW response', async () => {
    respRepo.findOne.mockResolvedValue({ id: 'r1', status: ResponseStatus.REVIEW });
    respRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.reviewResponse('t1', 'r1', 'u1', 'APPROVE', 'ok');
    expect(r.status).toBe(ResponseStatus.APPROVED);
    expect(r.reviewedBy).toBe('u1');
  });

  it('reviewResponse — rejects deciding a non-REVIEW response', async () => {
    respRepo.findOne.mockResolvedValue({ id: 'r1', status: ResponseStatus.PASSED });
    await expect(service.reviewResponse('t1', 'r1', 'u1', 'APPROVE')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-204: certificates ─────────────────────────────────────────

  it('listCertificates — computes expiry status as of date', async () => {
    certRepo.find.mockResolvedValue([
      { id: 'c1', expiryDate: '2026-01-01' }, // expired
      { id: 'c2', expiryDate: '2026-07-15' }, // expiring within 30d of 2026-06-30
      { id: 'c3', expiryDate: '2027-01-01' }, // valid
    ]);
    const r = await service.listCertificates('t1', 's1', '2026-06-30');
    expect(r.find((c) => c.id === 'c1').status).toBe('EXPIRED');
    expect(r.find((c) => c.id === 'c2').status).toBe('EXPIRING');
    expect(r.find((c) => c.id === 'c3').status).toBe('VALID');
  });

  it('expiringCertificates — returns only within-window certs sorted', async () => {
    certRepo.find.mockResolvedValue([
      { id: 'c1', expiryDate: '2027-01-01' },
      { id: 'c2', expiryDate: '2026-07-10' },
      { id: 'c3', expiryDate: '2026-06-01' },
    ]);
    const r = await service.expiringCertificates('t1', '2026-06-30', 30);
    expect(r.map((c) => c.id)).toEqual(['c3', 'c2']);
  });

  // ─── Ph-205: scorecard ────────────────────────────────────────────

  it('upsertScorecard — computes weighted overall score', async () => {
    scoreRepo.findOne.mockResolvedValue(null);
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.upsertScorecard('t1', { supplierId: 's1', period: '2026-06', onTimeDeliveryPct: 90, qualityRejectPct: 5, invoiceAccuracyPct: 95 });
    // 90*0.4 + 95*0.3 + 95*0.3 = 36 + 28.5 + 28.5 = 93
    expect(r.overallScore).toBe(93);
  });

  it('upsertScorecard — rejects bad period format', async () => {
    await expect(service.upsertScorecard('t1', { supplierId: 's1', period: '2026/6', onTimeDeliveryPct: 1, qualityRejectPct: 1, invoiceAccuracyPct: 1 })).rejects.toThrow(BadRequestException);
  });

  it('scorecardTrend — computes period-over-period deltas', async () => {
    scoreRepo.find.mockResolvedValue([
      { period: '2026-05', overallScore: 80, onTimeDeliveryPct: 0, qualityRejectPct: 0, invoiceAccuracyPct: 0 },
      { period: '2026-06', overallScore: 90, onTimeDeliveryPct: 0, qualityRejectPct: 0, invoiceAccuracyPct: 0 },
    ]);
    const r = await service.scorecardTrend('t1', 's1');
    expect(r.series[0].delta).toBeNull();
    expect(r.series[1].delta).toBe(10);
    expect(r.latest.period).toBe('2026-06');
  });
});
