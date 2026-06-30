import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ClmService } from './clm.service';
import { ContractClause, ClauseRisk } from './entities/contract-clause.entity';
import { ClauseDeviation, DeviationStatus } from './entities/clause-deviation.entity';
import { SignatureEnvelope, EnvelopeStatus } from './entities/signature-envelope.entity';
import { Contract } from '../entities/contract.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ClmService — Phase 209-213', () => {
  let service: ClmService;
  let clauseRepo: any, deviationRepo: any, envelopeRepo: any, contractRepo: any;

  beforeEach(async () => {
    clauseRepo = mockRepo(); deviationRepo = mockRepo(); envelopeRepo = mockRepo(); contractRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ClmService,
        { provide: getRepositoryToken(ContractClause), useValue: clauseRepo },
        { provide: getRepositoryToken(ClauseDeviation), useValue: deviationRepo },
        { provide: getRepositoryToken(SignatureEnvelope), useValue: envelopeRepo },
        { provide: getRepositoryToken(Contract), useValue: contractRepo },
      ],
    }).compile();
    service = module.get(ClmService);
  });

  // ─── Ph-209: clause library & assembly ────────────────────────────

  it('assemble — builds body from approved clauses in order', async () => {
    clauseRepo.find.mockResolvedValue([
      { code: 'C1', title: 'Term', standardText: 'Term text', isApproved: true, riskLevel: ClauseRisk.LOW },
      { code: 'C2', title: 'Liability', standardText: 'Liability text', isApproved: true, riskLevel: ClauseRisk.HIGH },
    ]);
    const r = await service.assemble('t1', ['C2', 'C1']);
    expect(r.clauseCount).toBe(2);
    expect(r.highRiskClauses).toEqual(['C2']);
    expect(r.body.indexOf('Liability')).toBeLessThan(r.body.indexOf('Term text'));
  });

  it('assemble — rejects unapproved clauses', async () => {
    clauseRepo.find.mockResolvedValue([{ code: 'C1', title: 'T', standardText: 'x', isApproved: false }]);
    await expect(service.assemble('t1', ['C1'])).rejects.toThrow(BadRequestException);
  });

  it('assemble — rejects unknown clause codes', async () => {
    clauseRepo.find.mockResolvedValue([]);
    await expect(service.assemble('t1', ['NOPE'])).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-210: deviations ───────────────────────────────────────────

  it('recordDeviation — no deviation when text matches standard', async () => {
    clauseRepo.findOne.mockResolvedValue({ code: 'C1', standardText: 'Standard text', riskLevel: ClauseRisk.LOW });
    const r = await service.recordDeviation('t1', { contractId: 'k1', clauseCode: 'C1', proposedText: 'Standard text' });
    expect(r.deviation).toBe(false);
  });

  it('recordDeviation — flags + routes to legal when text differs', async () => {
    clauseRepo.findOne.mockResolvedValue({ code: 'C1', standardText: 'Standard text', riskLevel: ClauseRisk.HIGH });
    deviationRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.recordDeviation('t1', { contractId: 'k1', clauseCode: 'C1', proposedText: 'Custom text' });
    expect(r.deviation).toBe(true);
    expect(r.routedTo).toBe('LEGAL');
    expect(r.record.status).toBe(DeviationStatus.PENDING);
  });

  it('reviewDeviation — rejects non-pending', async () => {
    deviationRepo.findOne.mockResolvedValue({ id: 'd1', status: DeviationStatus.APPROVED });
    await expect(service.reviewDeviation('t1', 'd1', 'u1', 'APPROVE')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-212: e-signature ──────────────────────────────────────────

  it('createEnvelope — requires signer emails', async () => {
    await expect(service.createEnvelope('t1', { contractId: 'k1', signers: [{ name: 'A', email: '' }] })).rejects.toThrow(BadRequestException);
  });

  it('updateSignature — completes envelope and stamps contract when all sign', async () => {
    envelopeRepo.findOne.mockResolvedValue({
      id: 'e1', contractId: 'k1', status: EnvelopeStatus.SENT,
      signers: [{ name: 'A', email: 'a@x.com', status: 'PENDING' }],
    });
    envelopeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    contractRepo.findOne.mockResolvedValue({ id: 'k1' });
    contractRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.updateSignature('t1', 'e1', { email: 'a@x.com', decision: 'SIGNED', at: '2026-06-30T10:00:00Z' });
    expect(r.status).toBe(EnvelopeStatus.SIGNED);
    expect(contractRepo.save).toHaveBeenCalled();
  });

  it('updateSignature — declined sets envelope DECLINED', async () => {
    envelopeRepo.findOne.mockResolvedValue({
      id: 'e1', contractId: 'k1', status: EnvelopeStatus.SENT,
      signers: [{ name: 'A', email: 'a@x.com', status: 'PENDING' }, { name: 'B', email: 'b@x.com', status: 'PENDING' }],
    });
    envelopeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.updateSignature('t1', 'e1', { email: 'b@x.com', decision: 'DECLINED', at: '2026-06-30T10:00:00Z' });
    expect(r.status).toBe(EnvelopeStatus.DECLINED);
  });

  // ─── Ph-213: renewal ──────────────────────────────────────────────

  it('renewalAlerts — buckets contracts by days to expiry', async () => {
    contractRepo.find.mockResolvedValue([
      { id: 'c1', contractNumber: 'K1', title: 'A', endDate: '2026-07-20', status: 'ACTIVE', renewalType: 'MANUAL' }, // 20d → 30
      { id: 'c2', contractNumber: 'K2', title: 'B', endDate: '2026-08-20', status: 'ACTIVE', renewalType: 'AUTO' },   // 51d → 60
      { id: 'c3', contractNumber: 'K3', title: 'C', endDate: '2027-01-01', status: 'ACTIVE', renewalType: 'MANUAL' }, // far → none
      { id: 'c4', contractNumber: 'K4', title: 'D', endDate: '2026-06-01', status: 'ACTIVE', renewalType: 'MANUAL' }, // past → OVERDUE
    ]);
    const r = await service.renewalAlerts('t1', '2026-06-30');
    expect(r.count).toBe(3);
    expect(r.alerts.find((a: any) => a.contractId === 'c1').bucket).toBe('30');
    expect(r.alerts.find((a: any) => a.contractId === 'c4').bucket).toBe('OVERDUE');
  });

  it('initiateRenewal — marks original RENEWED and drafts a renewal', async () => {
    contractRepo.findOne.mockResolvedValue({ id: 'c1', contractNumber: 'K1', title: 'A', type: 'SERVICE', status: 'ACTIVE', startDate: '2025-01-01', endDate: '2026-01-01', renewalType: 'MANUAL', alertDaysBefore: 30, currency: 'INR' });
    contractRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.initiateRenewal('t1', 'c1', '2027-01-01');
    expect(r.contractNumber).toBe('K1-R');
    expect(contractRepo.save).toHaveBeenCalledTimes(2);
  });
});
