import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, UserStatus } from '../users/entities/user.entity';
import { TenantsService } from '../tenants/tenants.service';

/**
 * Login path: credential validation, the 5-strike lockout, non-ACTIVE
 * rejection, counter reset on success, tenant-slug resolution, and the
 * licensedModules enrichment on the login payload.
 */
describe('AuthService — login & lockout', () => {
  let service: AuthService;
  let userRepo: any;
  let tenantsService: any;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-horse', 4);
  });

  beforeEach(async () => {
    userRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn((x: any) => Promise.resolve(x)) };
    tenantsService = {
      findBySlug: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 't1', name: 'Acme', settings: {} }),
      getLicensedModules: jest.fn().mockResolvedValue(['hr', 'finance']),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('tok'), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn((k: string, d?: any) => d) } },
        { provide: TenantsService, useValue: tenantsService },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  const activeUser = (over: any = {}) => ({
    id: 'u1', email: 'a@x.com', tenantId: 't1', status: UserStatus.ACTIVE,
    passwordHash, failedLoginAttempts: 0, isSuperAdmin: false, ...over,
  });

  it('accepts correct credentials, resets the failure counter and stamps lastLoginAt', async () => {
    const user = activeUser({ failedLoginAttempts: 3 });
    userRepo.findOne.mockResolvedValue(user);
    const r = await service.validateUser('A@X.com', 'correct-horse');
    expect(r).not.toBeNull();
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    // email lookup is lowercased
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: 'a@x.com' } });
  });

  it('rejects a wrong password and increments the failure counter', async () => {
    const user = activeUser({ failedLoginAttempts: 1 });
    userRepo.findOne.mockResolvedValue(user);
    expect(await service.validateUser('a@x.com', 'wrong')).toBeNull();
    expect(user.failedLoginAttempts).toBe(2);
    expect(user.status).toBe(UserStatus.ACTIVE); // not yet locked
  });

  it('locks the account on the 5th consecutive failure', async () => {
    const user = activeUser({ failedLoginAttempts: 4 });
    userRepo.findOne.mockResolvedValue(user);
    expect(await service.validateUser('a@x.com', 'wrong')).toBeNull();
    expect(user.failedLoginAttempts).toBe(5);
    expect(user.status).toBe(UserStatus.LOCKED);
  });

  it('rejects locked and non-active users even with the right password', async () => {
    userRepo.findOne.mockResolvedValue(activeUser({ status: UserStatus.LOCKED }));
    expect(await service.validateUser('a@x.com', 'correct-horse')).toBeNull();
    userRepo.findOne.mockResolvedValue(activeUser({ status: UserStatus.INACTIVE }));
    expect(await service.validateUser('a@x.com', 'correct-horse')).toBeNull();
  });

  it('resolves the user within the tenant when a slug is given, null on unknown slug', async () => {
    tenantsService.findBySlug.mockResolvedValue({ id: 't1' });
    userRepo.findOne.mockResolvedValue(activeUser());
    expect(await service.validateUser('a@x.com', 'correct-horse', 'acme')).not.toBeNull();
    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: 'a@x.com', tenantId: 't1' } });

    tenantsService.findBySlug.mockRejectedValue(new NotFoundException());
    expect(await service.validateUser('a@x.com', 'correct-horse', 'ghost')).toBeNull();
  });

  it('login throws UnauthorizedException on bad credentials', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.login({ email: 'a@x.com', password: 'x' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('login returns tokens plus the tenant enriched with licensedModules', async () => {
    userRepo.findOne.mockResolvedValue(activeUser());
    const r: any = await service.login({ email: 'a@x.com', password: 'correct-horse' } as any);
    expect(r.tenant.licensedModules).toEqual(['hr', 'finance']);
    expect(tenantsService.getLicensedModules).toHaveBeenCalledWith('t1');
  });

  it('getProfile enriches the tenant and returns a trimmed user', async () => {
    userRepo.findOne.mockResolvedValue(activeUser());
    const r: any = await service.getProfile('u1', 't1');
    expect(r.tenant.licensedModules).toEqual(['hr', 'finance']);
    expect(r.user).not.toHaveProperty('passwordHash');
  });
});
