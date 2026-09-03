import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { PiiField, MaskStrategy } from './entities/pii-field.entity';
import { Consent } from './entities/consent.entity';
import { ErasureRequest, ErasureStatus } from './entities/erasure-request.entity';
import { DsarRequest } from './entities/dsar-request.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('PrivacyService — Phase 269-272', () => {
  let service: PrivacyService;
  let piiRepo: any, consentRepo: any, erasureRepo: any, dsarRepo: any;

  beforeEach(async () => {
    piiRepo = mockRepo(); consentRepo = mockRepo(); erasureRepo = mockRepo(); dsarRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        PrivacyService,
        { provide: getRepositoryToken(PiiField), useValue: piiRepo },
        { provide: getRepositoryToken(Consent), useValue: consentRepo },
        { provide: getRepositoryToken(ErasureRequest), useValue: erasureRepo },
        { provide: getRepositoryToken(DsarRequest), useValue: dsarRepo },
      ],
    }).compile();
    service = module.get(PrivacyService);
  });

  // ─── Ph-269: PII inventory + masking ──────────────────────────────

  it('mask — PARTIAL keeps the last 4', () => {
    expect(service.mask('4111111111111234', MaskStrategy.PARTIAL)).toBe('************1234');
  });

  it('mask — EMAIL keeps the first char and domain', () => {
    expect(service.mask('alice@example.com', MaskStrategy.EMAIL)).toBe('a***@example.com');
  });

  it('registerPiiField — upserts on entity+field', async () => {
    piiRepo.findOne.mockResolvedValue({ id: 'p1', sensitivity: 'LOW', maskStrategy: MaskStrategy.FULL });
    piiRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.registerPiiField('t1', { entityName: 'Employee', fieldName: 'ssn', category: 'GOV_ID', sensitivity: 'HIGH' });
    expect(piiRepo.create).not.toHaveBeenCalled();
  });

  // ─── Ph-270: consent ──────────────────────────────────────────────

  it('recordConsent — grant sets grantedAt and clears withdrawal', async () => {
    consentRepo.findOne.mockResolvedValue(null);
    consentRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const c = await service.recordConsent('t1', { subjectId: 's1', purpose: 'MARKETING', granted: true, at: '2026-06-01T00:00:00Z' });
    expect(c.granted).toBe(true);
    expect(c.grantedAt).toBeInstanceOf(Date);
    expect(c.withdrawnAt).toBeNull();
  });

  it('hasConsent — false when no record', async () => {
    consentRepo.findOne.mockResolvedValue(null);
    expect((await service.hasConsent('t1', 's1', 'MARKETING')).granted).toBe(false);
  });

  // ─── Ph-271: erasure ──────────────────────────────────────────────

  it('processErasures — anonymizes only requests past retention', async () => {
    erasureRepo.find.mockResolvedValue([
      { id: 'e1', subjectId: 's1', status: ErasureStatus.PENDING, retentionUntil: '2026-01-01' },
      { id: 'e2', subjectId: 's2', status: ErasureStatus.PENDING, retentionUntil: '2027-01-01' },
    ]);
    erasureRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.processErasures('t1', '2026-06-30');
    expect(r.anonymized).toBe(1);
    expect(r.retained).toBe(1);
    expect(r.subjects).toEqual(['s1']);
  });

  // ─── Ph-272: DSAR ─────────────────────────────────────────────────

  it('fulfilDsar — exports records + consents and opens an audit log', async () => {
    consentRepo.find.mockResolvedValue([{ purpose: 'MARKETING', granted: true }]);
    dsarRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.fulfilDsar('t1', 'admin', { subjectId: 's1', data: { name: 'Alice' }, at: '2026-06-30T00:00:00Z' });
    expect(r.exportedData.records).toMatchObject({ name: 'Alice' });
    expect(r.exportedData.consents).toHaveLength(1);
    expect(r.accessLog[0].action).toBe('EXPORT_CREATED');
  });

  it('accessDsar — appends an access-audit entry', async () => {
    dsarRepo.findOne.mockResolvedValue({ id: 'd1', accessLog: [{ userId: 'admin', at: 'x', action: 'EXPORT_CREATED' }] });
    dsarRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.accessDsar('t1', 'd1', 'auditor', '2026-07-01T00:00:00Z');
    expect(r.accessLog).toHaveLength(2);
    expect(r.accessLog[1]).toMatchObject({ userId: 'auditor', action: 'ACCESSED' });
  });
});
