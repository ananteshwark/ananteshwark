import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserStatus } from '../users/entities/user.entity';
import * as bcrypt from 'bcryptjs';

/**
 * MFA login enforcement: a verified TOTP enrollment converts login into a
 * two-step exchange — password yields only a short-lived challenge token;
 * tokens are issued exclusively by verifyMfa with a valid code.
 */
describe('AuthService — MFA-enforced login', () => {
  const passwordHash = bcrypt.hashSync('correct-horse', 4);
  const activeUser: any = {
    id: 'u1', email: 'a@x.com', tenantId: 't1', status: UserStatus.ACTIVE,
    passwordHash, firstName: 'A', lastName: 'B', isSuperAdmin: false,
    failedLoginAttempts: 0,
  };

  const userRepo: any = {
    findOne: jest.fn(),
    save: jest.fn((u: any) => Promise.resolve(u)),
  };
  const jwtService: any = {
    sign: jest.fn((payload: any) => `signed:${payload.typ ?? 'access'}:${payload.sub}`),
    verify: jest.fn(),
  };
  const configService: any = { get: jest.fn((_k: string, d?: any) => d) };
  const tenantsService: any = {
    findById: jest.fn().mockResolvedValue({ id: 't1', name: 'T1' }),
    getLicensedModules: jest.fn().mockResolvedValue(['hr']),
  };
  const securityService: any = {
    getActiveTotpEnrollment: jest.fn(),
    verifyTotp: jest.fn(),
  };

  const service = new AuthService(userRepo, jwtService, configService, tenantsService, securityService);

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findOne.mockResolvedValue({ ...activeUser });
    tenantsService.findById.mockResolvedValue({ id: 't1', name: 'T1' });
    tenantsService.getLicensedModules.mockResolvedValue(['hr']);
  });

  it('login returns an MFA challenge — not tokens — when a verified enrollment exists', async () => {
    securityService.getActiveTotpEnrollment.mockResolvedValue({ totpSecret: 'SECRET' });
    const result: any = await service.login({ email: 'a@x.com', password: 'correct-horse' } as any);
    expect(result.mfaRequired).toBe(true);
    expect(result.mfaToken).toContain('signed:mfa:u1');
    expect(result.accessToken).toBeUndefined(); // no session before step two
  });

  it('login issues tokens directly when no enrollment exists', async () => {
    securityService.getActiveTotpEnrollment.mockResolvedValue(null);
    const result: any = await service.login({ email: 'a@x.com', password: 'correct-horse' } as any);
    expect(result.accessToken).toBeDefined();
    expect(result.mfaRequired).toBeUndefined();
    expect(result.tenant.licensedModules).toEqual(['hr']);
  });

  it('verifyMfa exchanges a valid challenge + code for a full session', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1', tenantId: 't1', typ: 'mfa' });
    securityService.getActiveTotpEnrollment.mockResolvedValue({ totpSecret: 'SECRET' });
    securityService.verifyTotp.mockReturnValue(true);
    const result: any = await service.verifyMfa('challenge-token', '123456');
    expect(result.accessToken).toBeDefined();
    expect(result.user.id).toBe('u1');
    expect(securityService.verifyTotp).toHaveBeenCalledWith('SECRET', '123456', expect.any(Number));
  });

  it('verifyMfa rejects wrong codes, wrong token types, and expired challenges', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1', tenantId: 't1', typ: 'mfa' });
    securityService.getActiveTotpEnrollment.mockResolvedValue({ totpSecret: 'SECRET' });
    securityService.verifyTotp.mockReturnValue(false);
    await expect(service.verifyMfa('t', '000000')).rejects.toThrow('Invalid MFA code');

    jwtService.verify.mockReturnValue({ sub: 'u1', tenantId: 't1', typ: 'refresh' });
    await expect(service.verifyMfa('t', '123456')).rejects.toThrow('Invalid MFA token');

    jwtService.verify.mockImplementation(() => { throw new Error('jwt expired'); });
    await expect(service.verifyMfa('t', '123456')).rejects.toThrow('MFA challenge expired');
  });

  it('verifyMfa refuses non-active users even with a valid code', async () => {
    jwtService.verify.mockReturnValue({ sub: 'u1', tenantId: 't1', typ: 'mfa' });
    userRepo.findOne.mockResolvedValue({ ...activeUser, status: UserStatus.LOCKED });
    await expect(service.verifyMfa('t', '123456')).rejects.toThrow(UnauthorizedException);
  });
});
