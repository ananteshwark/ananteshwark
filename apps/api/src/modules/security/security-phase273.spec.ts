import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SecurityService } from './security.service';
import { MfaEnrollment } from './entities/mfa-enrollment.entity';
import { IpAllowlistEntry } from './entities/ip-allowlist.entity';
import { UserSession } from './entities/user-session.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('SecurityService — Phase 273-276', () => {
  let service: SecurityService;
  let mfaRepo: any, ipRepo: any, sessionRepo: any;

  beforeEach(async () => {
    mfaRepo = mockRepo(); ipRepo = mockRepo(); sessionRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        SecurityService,
        { provide: getRepositoryToken(MfaEnrollment), useValue: mfaRepo },
        { provide: getRepositoryToken(IpAllowlistEntry), useValue: ipRepo },
        { provide: getRepositoryToken(UserSession), useValue: sessionRepo },
      ],
    }).compile();
    service = module.get(SecurityService);
  });

  // ─── Ph-273: TOTP ─────────────────────────────────────────────────

  it('totpCode — deterministic 6-digit code for a fixed secret+time', () => {
    const code = service.totpCode('JBSWY3DPEHPK3PXP', 1_700_000_000_000);
    expect(code).toMatch(/^\d{6}$/);
    // Stable across calls with the same inputs.
    expect(service.totpCode('JBSWY3DPEHPK3PXP', 1_700_000_000_000)).toBe(code);
  });

  it('verifyTotp — accepts the current code, rejects a wrong one', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const t = 1_700_000_000_000;
    expect(service.verifyTotp(secret, service.totpCode(secret, t), t)).toBe(true);
    expect(service.verifyTotp(secret, '000000', t)).toBe(false);
  });

  it('verifyTotp — tolerates one step of clock skew', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const t = 1_700_000_000_000;
    const prevCode = service.totpCode(secret, t - 30_000);
    expect(service.verifyTotp(secret, prevCode, t, 1)).toBe(true);
  });

  // ─── Ph-274: IP allowlist ─────────────────────────────────────────

  it('isIpAllowed — empty allowlist allows all', async () => {
    ipRepo.find.mockResolvedValue([]);
    expect((await service.isIpAllowed('t1', '8.8.8.8')).allowed).toBe(true);
  });

  it('isIpAllowed — matches a CIDR range', async () => {
    ipRepo.find.mockResolvedValue([{ cidr: '203.0.113.0/24', isActive: true }]);
    expect((await service.isIpAllowed('t1', '203.0.113.55')).allowed).toBe(true);
    expect((await service.isIpAllowed('t1', '203.0.114.1')).allowed).toBe(false);
  });

  // ─── Ph-275: sessions + anomaly ───────────────────────────────────

  it('recordSession — flags a new IP and off-hours login', async () => {
    sessionRepo.find.mockResolvedValue([{ ipAddress: '10.0.0.1' }]);
    sessionRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const s = await service.recordSession('t1', { userId: 'u1', ipAddress: '9.9.9.9', at: '2026-06-30T03:00:00Z' });
    expect(s.anomalyFlags).toContain('NEW_IP');
    expect(s.anomalyFlags).toContain('OFF_HOURS');
  });

  it('recordSession — no NEW_IP flag for a known IP in business hours', async () => {
    sessionRepo.find.mockResolvedValue([{ ipAddress: '10.0.0.1' }]);
    sessionRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const s = await service.recordSession('t1', { userId: 'u1', ipAddress: '10.0.0.1', at: '2026-06-30T12:00:00Z' });
    expect(s.anomalyFlags).toEqual([]);
  });

  // ─── Ph-276: field encryption ─────────────────────────────────────

  it('encryptField/decryptField — round-trips per tenant key', () => {
    const token = service.encryptField('t1', '4111-1111-1111-1234');
    expect(token).not.toContain('4111');
    expect(service.decryptField('t1', token)).toBe('4111-1111-1111-1234');
  });

  it('decryptField — a different tenant key cannot decrypt', () => {
    const token = service.encryptField('t1', 'secret-salary');
    expect(() => service.decryptField('t2', token)).toThrow();
  });
});
