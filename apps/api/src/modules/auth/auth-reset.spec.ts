import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { TenantsService } from '../tenants/tenants.service';

const mockRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn((x) => Promise.resolve(x)),
  increment: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('AuthService — password reset (C3) & refresh status (H5)', () => {
  let service: AuthService;
  let userRepo: any;
  const config = { get: jest.fn((k: string, d?: any) => (k === 'APP_ENV' ? 'development' : d)) };
  const jwt = { verify: jest.fn(), sign: jest.fn().mockReturnValue('tok') };

  beforeEach(async () => {
    userRepo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: TenantsService, useValue: { findBySlug: jest.fn(), findById: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('forgotPassword returns a generic message and no token for unknown email', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const res: any = await service.forgotPassword({ email: 'nobody@x.com' } as any);
    expect(res.resetToken).toBeUndefined();
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('forgotPassword stores a hashed token (never the raw token) for a real user', async () => {
    const user: any = { id: 'u1', email: 'a@x.com', status: UserStatus.ACTIVE };
    userRepo.findOne.mockResolvedValue(user);
    const res: any = await service.forgotPassword({ email: 'A@x.com' } as any);
    expect(res.resetToken).toBeDefined();
    // stored hash must equal sha256(rawToken), i.e. raw token is not stored
    expect(user.passwordResetTokenHash).toBe(createHash('sha256').update(res.resetToken).digest('hex'));
    expect(user.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('resetPassword rejects an expired token', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', passwordResetTokenHash: 'h', passwordResetExpiresAt: new Date(Date.now() - 1000) });
    await expect(service.resetPassword({ token: 'x', password: 'newpassw0rd' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetPassword sets the new hash, clears token, and unlocks the account', async () => {
    const user: any = { id: 'u1', status: UserStatus.LOCKED, failedLoginAttempts: 5, passwordResetTokenHash: 'h', passwordResetExpiresAt: new Date(Date.now() + 10000) };
    userRepo.findOne.mockResolvedValue(user);
    await service.resetPassword({ token: 'rawtok', password: 'newpassw0rd' } as any);
    expect(await bcrypt.compare('newpassw0rd', user.passwordHash)).toBe(true);
    expect(user.passwordResetTokenHash).toBeNull();
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.status).toBe(UserStatus.ACTIVE);
  });

  it('refreshToken refuses a locked account', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1' });
    userRepo.findOne.mockResolvedValue({ id: 'u1', status: UserStatus.LOCKED });
    await expect(service.refreshToken({ refreshToken: 'r' } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refreshToken rejects a token minted before a password change (stale tokenVersion)', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', tokenVersion: 0 }); // token from before the change
    userRepo.findOne.mockResolvedValue({ id: 'u1', status: UserStatus.ACTIVE, tokenVersion: 1 });
    await expect(service.refreshToken({ refreshToken: 'r' } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes outstanding refresh tokens by bumping tokenVersion', async () => {
    // Clearing the cookie only drops the browser's copy; a captured token
    // would otherwise stay valid for its full lifetime after "logging out".
    await expect(service.logout('u1')).resolves.toEqual({ message: 'Logged out successfully' });
    expect(userRepo.increment).toHaveBeenCalledWith({ id: 'u1' }, 'tokenVersion', 1);
  });

  it('resetPassword bumps tokenVersion to revoke existing refresh tokens', async () => {
    const user: any = { id: 'u1', status: UserStatus.ACTIVE, failedLoginAttempts: 0, tokenVersion: 3, passwordResetTokenHash: 'h', passwordResetExpiresAt: new Date(Date.now() + 10000) };
    userRepo.findOne.mockResolvedValue(user);
    await service.resetPassword({ token: 'rawtok', password: 'newpassw0rd' } as any);
    expect(user.tokenVersion).toBe(4);
  });
});
