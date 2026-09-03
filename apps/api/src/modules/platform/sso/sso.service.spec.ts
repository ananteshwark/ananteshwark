import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SsoService } from './sso.service';
import { SsoProtocol } from '../entities/sso-provider.entity';
import { UserStatus } from '../../users/entities/user.entity';

/**
 * SSO: providers start inactive with duplicate-name protection, the OIDC
 * auth URL carries the right params + random state, JIT provisioning
 * creates ACTIVE users from claims and refuses locked/inactive accounts.
 */
describe('SsoService', () => {
  let service: SsoService;
  let providerRepo: any, userRepo: any, tenantsService: any, jwtService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    providerRepo = mockRepo(); userRepo = mockRepo();
    tenantsService = { findById: jest.fn().mockResolvedValue({ id: 't1' }) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    service = new SsoService(providerRepo, userRepo, tenantsService, jwtService);
  });

  it('createProvider starts inactive with default attribute mapping and rejects duplicates', async () => {
    const p = await service.createProvider('t1', { name: 'Okta', protocol: SsoProtocol.OIDC } as any);
    expect(p.isActive).toBe(false);
    expect(p.attributeMapping).toEqual({ email: 'email', firstName: 'given_name', lastName: 'family_name' });

    providerRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createProvider('t1', { name: 'Okta', protocol: SsoProtocol.OIDC } as any)).rejects.toThrow('already exists');
  });

  it('buildOidcAuthUrl requires an active OIDC provider with issuer + clientId', async () => {
    providerRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', isActive: false, protocol: SsoProtocol.OIDC });
    await expect(service.buildOidcAuthUrl('t1', 'p1', 'https://app/cb')).rejects.toThrow('inactive');

    providerRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', isActive: true, protocol: SsoProtocol.SAML });
    await expect(service.buildOidcAuthUrl('t1', 'p1', 'https://app/cb')).rejects.toThrow('not OIDC');

    providerRepo.findOne.mockResolvedValue({
      id: 'p1', tenantId: 't1', isActive: true, protocol: SsoProtocol.OIDC,
      issuerUrl: 'https://idp.example.com/', clientId: 'client-1',
    });
    const { url, state } = await service.buildOidcAuthUrl('t1', 'p1', 'https://app/cb');
    expect(url).toContain('https://idp.example.com/authorize?');
    expect(url).toContain('client_id=client-1');
    expect(url).toContain(`state=${state}`);
    expect(state).toMatch(/^[0-9a-f]{32}$/);
  });

  it('JIT-provisions a new ACTIVE user from claims (no password hash) and signs a token', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const r = await service.provisionUserFromSso('t1', { email: 'New.User@X.com', firstName: 'New', lastName: 'User' });
    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new.user@x.com', status: UserStatus.ACTIVE, passwordHash: null,
    }));
    expect(r.accessToken).toBe('signed-jwt');
    expect(r.user).not.toHaveProperty('passwordHash');
  });

  it('refuses locked and inactive accounts, re-activates INVITED users', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', status: UserStatus.LOCKED });
    await expect(service.provisionUserFromSso('t1', { email: 'a@x.com' })).rejects.toThrow(UnauthorizedException);

    userRepo.findOne.mockResolvedValue({ id: 'u1', status: UserStatus.INACTIVE });
    await expect(service.provisionUserFromSso('t1', { email: 'a@x.com' })).rejects.toThrow(UnauthorizedException);

    const invited: any = { id: 'u1', tenantId: 't1', email: 'a@x.com', status: UserStatus.INVITED };
    userRepo.findOne.mockResolvedValue(invited);
    await service.provisionUserFromSso('t1', { email: 'a@x.com' });
    expect(invited.status).toBe(UserStatus.ACTIVE);
    expect(invited.lastLoginAt).toBeInstanceOf(Date);
  });

  it('getSpMetadata is SAML-only and embeds the tenant/provider entity ID', async () => {
    providerRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', protocol: SsoProtocol.OIDC });
    await expect(service.getSpMetadata('t1', 'p1')).rejects.toThrow(BadRequestException);

    providerRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', protocol: SsoProtocol.SAML });
    const xml = await service.getSpMetadata('t1', 'p1');
    expect(xml).toContain('urn:erp:sp:t1:p1');

    providerRepo.findOne.mockResolvedValue(null);
    await expect(service.getSpMetadata('t2', 'x')).rejects.toThrow(NotFoundException);
  });
});
