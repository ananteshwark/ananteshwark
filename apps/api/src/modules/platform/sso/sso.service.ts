import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { SsoProvider, SsoProtocol } from '../entities/sso-provider.entity';
import { User, UserStatus } from '../../users/entities/user.entity';
import { TenantsService } from '../../tenants/tenants.service';
import {
  CreateSsoProviderDto,
  UpdateSsoProviderDto,
} from './dto/sso.dto';

export interface SsoUserClaims {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  department?: string;
  externalId?: string;
}

@Injectable()
export class SsoService {
  constructor(
    @InjectRepository(SsoProvider)
    private readonly providerRepo: Repository<SsoProvider>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  // ─── Provider CRUD ───────────────────────────────────────────────────────────

  listProviders(tenantId: string): Promise<SsoProvider[]> {
    return this.providerRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async getProvider(tenantId: string, id: string): Promise<SsoProvider> {
    const p = await this.providerRepo.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException(`SSO provider ${id} not found`);
    return p;
  }

  async createProvider(
    tenantId: string,
    dto: CreateSsoProviderDto,
  ): Promise<SsoProvider> {
    const existing = await this.providerRepo.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) throw new BadRequestException(`SSO provider "${dto.name}" already exists`);

    const provider = this.providerRepo.create({
      tenantId,
      name: dto.name,
      protocol: dto.protocol,
      issuerUrl: dto.issuerUrl ?? null,
      metadataUrl: dto.metadataUrl ?? null,
      clientId: dto.clientId ?? null,
      clientSecret: dto.clientSecret ?? null,
      certificate: dto.certificate ?? null,
      attributeMapping: dto.attributeMapping ?? {
        email: 'email',
        firstName: 'given_name',
        lastName: 'family_name',
      },
      isActive: false,
    });
    return this.providerRepo.save(provider);
  }

  async updateProvider(
    tenantId: string,
    id: string,
    dto: UpdateSsoProviderDto,
  ): Promise<SsoProvider> {
    const provider = await this.getProvider(tenantId, id);
    if (dto.name !== undefined) provider.name = dto.name;
    if (dto.issuerUrl !== undefined) provider.issuerUrl = dto.issuerUrl;
    if (dto.metadataUrl !== undefined) provider.metadataUrl = dto.metadataUrl;
    if (dto.clientId !== undefined) provider.clientId = dto.clientId;
    if (dto.clientSecret !== undefined) provider.clientSecret = dto.clientSecret;
    if (dto.certificate !== undefined) provider.certificate = dto.certificate;
    if (dto.attributeMapping !== undefined) provider.attributeMapping = dto.attributeMapping;
    if (dto.isActive !== undefined) provider.isActive = dto.isActive;
    return this.providerRepo.save(provider);
  }

  async deleteProvider(tenantId: string, id: string): Promise<void> {
    const provider = await this.getProvider(tenantId, id);
    await this.providerRepo.remove(provider);
  }

  // ─── OIDC Initiation ────────────────────────────────────────────────────────

  async buildOidcAuthUrl(
    tenantId: string,
    providerId: string,
    redirectUri: string,
  ): Promise<{ url: string; state: string }> {
    const provider = await this.getProvider(tenantId, providerId);
    if (!provider.isActive) throw new BadRequestException('SSO provider is inactive');
    if (provider.protocol !== SsoProtocol.OIDC) {
      throw new BadRequestException('Provider is not OIDC');
    }
    if (!provider.issuerUrl || !provider.clientId) {
      throw new BadRequestException('Provider missing issuerUrl or clientId');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: provider.clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
    });

    // Well-known OIDC authorization endpoint convention
    const authEndpoint = `${provider.issuerUrl.replace(/\/$/, '')}/authorize`;
    return { url: `${authEndpoint}?${params.toString()}`, state };
  }

  // ─── JIT Provisioning ────────────────────────────────────────────────────────

  /**
   * Find or create a user from SSO claims (JIT provisioning).
   * Returns a JWT access token for the provisioned/existing user.
   */
  async provisionUserFromSso(
    tenantId: string,
    claims: SsoUserClaims,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant) throw new UnauthorizedException('Tenant not found');

    let user = await this.userRepo.findOne({
      where: { email: claims.email.toLowerCase(), tenantId },
    });

    if (!user) {
      // JIT provision: auto-create the user
      const [firstName, ...rest] = (claims.displayName ?? claims.email).split(' ');
      user = this.userRepo.create({
        tenantId,
        email: claims.email.toLowerCase(),
        firstName: claims.firstName ?? firstName ?? claims.email,
        lastName: claims.lastName ?? rest.join(' ') ?? '',
        status: UserStatus.ACTIVE,
        passwordHash: null,
        failedLoginAttempts: 0,
        mfaEnabled: false,
      });
      user = await this.userRepo.save(user);
    } else if (user.status === UserStatus.LOCKED) {
      throw new UnauthorizedException('User account is locked');
    } else if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.INVITED) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Update last login
    user.status = UserStatus.ACTIVE;
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: [],
    };

    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
      },
    };
  }

  // ─── SAML metadata stub ─────────────────────────────────────────────────────

  async getSpMetadata(tenantId: string, providerId: string): Promise<string> {
    const provider = await this.getProvider(tenantId, providerId);
    if (provider.protocol !== SsoProtocol.SAML) {
      throw new BadRequestException('Provider is not SAML');
    }
    // Return a minimal SP metadata XML for the admin to upload to their IdP
    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="urn:erp:sp:${tenantId}:${providerId}">
  <SPSSODescriptor AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="/auth/sso/${providerId}/saml/callback"
      index="1" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
  }
}
