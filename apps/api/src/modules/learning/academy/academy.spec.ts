import { BadRequestException } from '@nestjs/common';
import { AcademyService } from './academy.service';
import { CertEnrollmentStatus } from './entities/academy.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

const NOW = new Date('2026-07-11T00:00:00Z');

describe('AcademyService', () => {
  let service: AcademyService;
  let certRepo: any, enrollRepo: any, automation: any;

  beforeEach(() => {
    certRepo = mockRepo(); enrollRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new AcademyService(certRepo, enrollRepo, automation);
  });

  it('creates a certification and rejects one with no requirements', async () => {
    const cert = await service.createCertification('t1', { name: 'Data Cert', requirements: [{ type: 'COURSE', ref: 'c1' }], validityMonths: 12 });
    expect(cert.name).toBe('Data Cert');
    await expect(service.createCertification('t1', { name: 'X', requirements: [] })).rejects.toThrow(BadRequestException);
  });

  describe('recordRequirement → certification', () => {
    const cert = { id: 'cert-abcdef12', tenantId: 't1', validityMonths: 12, requirements: [{ type: 'COURSE', ref: 'c1' }, { type: 'ASSESSMENT', ref: 'a1', minScore: 70 }] };

    it('stays IN_PROGRESS until all requirements are met', async () => {
      enrollRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', certId: 'cert-abcdef12', learnerId: 'l-12345678', status: CertEnrollmentStatus.ENROLLED, progress: [] });
      certRepo.findOne.mockResolvedValue(cert);
      const e = await service.recordRequirement('t1', 'e1', { ref: 'c1' }, NOW);
      expect(e.status).toBe(CertEnrollmentStatus.IN_PROGRESS);
    });

    it('does not certify when an assessment minScore is not met', async () => {
      enrollRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', certId: 'cert-abcdef12', learnerId: 'l-12345678', status: CertEnrollmentStatus.IN_PROGRESS, progress: [{ ref: 'c1', score: null }] });
      certRepo.findOne.mockResolvedValue(cert);
      const e = await service.recordRequirement('t1', 'e1', { ref: 'a1', score: 65 }, NOW);
      expect(e.status).toBe(CertEnrollmentStatus.IN_PROGRESS);
    });

    it('certifies with an expiry and certificate when all pass, emitting academy.certified', async () => {
      enrollRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', certId: 'cert-abcdef12', learnerId: 'l-12345678', status: CertEnrollmentStatus.IN_PROGRESS, progress: [{ ref: 'c1', score: null }] });
      certRepo.findOne.mockResolvedValue(cert);
      const e = await service.recordRequirement('t1', 'e1', { ref: 'a1', score: 88 }, NOW);
      expect(e.status).toBe(CertEnrollmentStatus.CERTIFIED);
      expect(e.expiresAt).toBe('2027-07-11'); // +12 months
      expect(e.certificateRef).toMatch(/^CERT-/);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'academy.certified', expect.objectContaining({ learnerId: 'l-12345678' }));
    });

    it('rejects a requirement not on the certification', async () => {
      enrollRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', certId: 'cert-abcdef12', status: CertEnrollmentStatus.ENROLLED, progress: [] });
      certRepo.findOne.mockResolvedValue(cert);
      await expect(service.recordRequirement('t1', 'e1', { ref: 'nope' }, NOW)).rejects.toThrow(BadRequestException);
    });
  });

  it('expireSweep flips certified-but-expired enrolments', async () => {
    enrollRepo.find.mockResolvedValue([{ status: CertEnrollmentStatus.CERTIFIED }, { status: CertEnrollmentStatus.CERTIFIED }]);
    const res = await service.expireSweep('t1', '2026-07-11');
    expect(res.expired).toBe(2);
  });
});
