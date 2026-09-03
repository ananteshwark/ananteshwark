import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { User, UserStatus } from '../users/entities/user.entity';
import { StarterKitService } from '../platform/starter-kit/starter-kit.service';
import { TenantsService } from '../tenants/tenants.service';
import { SecurityService } from '../security/security.service';
import { TenantPlan } from '../tenants/entities/tenant.entity';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    @Optional() private readonly securityService?: SecurityService,
    @Optional() private readonly starterKit?: StarterKitService,
  ) {}

  async validateUser(email: string, password: string, tenantSlug?: string) {
    let user: User;
    if (tenantSlug) {
      try {
        const tenant = await this.tenantsService.findBySlug(tenantSlug);
        user = await this.userRepository.findOne({
          where: { email: email.toLowerCase(), tenantId: tenant.id },
        });
      } catch (e) {
        return null;
      }
    } else {
      user = await this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    }

    if (!user) return null;
    if (user.status === UserStatus.LOCKED) return null;
    if (user.status !== UserStatus.ACTIVE) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) user.status = UserStatus.LOCKED;
      await this.userRepository.save(user);
      return null;
    }

    user.failedLoginAttempts = 0;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);
    return user;
  }

  // Attach the super-admin-assigned module set so the client can show tenant
  // admins exactly what their platform administrator provisioned.
  private async withLicensedModules(tenant: any) {
    const licensedModules = await this.tenantsService.getLicensedModules(tenant.id);
    return { ...tenant, licensedModules };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password, dto.tenantSlug);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // A verified TOTP enrollment turns the password check into step one of
    // two: no tokens are issued until the code is verified.
    const enrollment = await this.securityService?.getActiveTotpEnrollment(user.tenantId, user.id);
    if (enrollment) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, tenantId: user.tenantId, typ: 'mfa' },
        { expiresIn: '5m' },
      );
      return { mfaRequired: true, mfaToken };
    }

    return this.issueSession(user);
  }

  private async issueSession(user: User) {
    const tokens = await this.generateTokens(user);
    const tenant = await this.tenantsService.findById(user.tenantId);
    return { ...tokens, tenant: await this.withLicensedModules(tenant) };
  }

  /** Step two of an MFA login: exchange the short-lived challenge token plus
   *  a valid TOTP code for a real session. */
  async verifyMfa(mfaToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('MFA challenge expired — sign in again');
    }
    if (payload?.typ !== 'mfa') throw new UnauthorizedException('Invalid MFA token');

    const user = await this.userRepository.findOne({
      where: { id: payload.sub, tenantId: payload.tenantId },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();

    const enrollment = await this.securityService?.getActiveTotpEnrollment(user.tenantId, user.id);
    if (!enrollment?.totpSecret) throw new UnauthorizedException('No MFA enrollment');
    if (!this.securityService!.verifyTotp(enrollment.totpSecret, code, Date.now())) {
      throw new UnauthorizedException('Invalid MFA code');
    }
    return this.issueSession(user);
  }

  // Returns the current user + tenant, used by the client to refresh the
  // session on app load so newly added fields (e.g. isSuperAdmin) propagate
  // without forcing a manual re-login.
  async getProfile(userId: string, tenantId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new UnauthorizedException();
    const tenant = await this.tenantsService.findById(tenantId);
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        isSuperAdmin: user.isSuperAdmin,
      },
      tenant: await this.withLicensedModules(tenant),
    };
  }

  async register(dto: RegisterDto) {
    const slugBase = dto.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    const tenant = await this.tenantsService.create({
      name: dto.companyName,
      slug,
      plan: TenantPlan.TRIAL,
    });

    const existing = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase(), tenantId: tenant.id },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({
      tenantId: tenant.id,
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    const savedUser = await this.userRepository.save(user);

    // First-run content (leave types, badges, letter templates, KB
    // categories, journey templates) so the trial isn't an empty shell.
    // Best-effort: seeding must never fail registration.
    await this.starterKit?.seed(tenant.id).catch(() => undefined);

    const tokens = await this.generateTokens(savedUser);
    return { ...tokens, tenant };
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh-secret'),
      });
      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException();
      // A locked or otherwise non-active account must not be able to mint fresh
      // tokens by refreshing an old one.
      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }
      // Reject refresh tokens minted before a credential change (password reset
      // / change bumps tokenVersion), so a stolen token can't outlive it.
      if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const genericMessage = { message: 'If an account exists with that email, a password reset link has been sent' };
    let user: User | null = null;
    if (dto.tenantSlug) {
      try {
        const tenant = await this.tenantsService.findBySlug(dto.tenantSlug);
        user = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase(), tenantId: tenant.id } });
      } catch {
        user = null;
      }
    } else {
      user = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });
    }

    // Always return the same response regardless of whether the account exists,
    // to avoid leaking which emails are registered.
    if (!user) return genericMessage;

    const rawToken = randomBytes(32).toString('hex');
    user.passwordResetTokenHash = createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.userRepository.save(user);

    // Email delivery is best-effort and configured per tenant; the raw token is
    // surfaced in the response only outside production so the flow is usable
    // before SMTP is wired up.
    const isProd = this.configService.get('APP_ENV') === 'production';
    return isProd ? genericMessage : { ...genericMessage, resetToken: rawToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const user = await this.userRepository.findOne({ where: { passwordResetTokenHash: tokenHash } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(dto.password, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    // A successful reset also clears any lockout so the user can log in again.
    user.failedLoginAttempts = 0;
    if (user.status === UserStatus.LOCKED) user.status = UserStatus.ACTIVE;
    // Revoke every refresh token issued before the reset (the reset is exactly
    // the compromised-credential case).
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.userRepository.save(user);
    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, tenantId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new UnauthorizedException();

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    // Invalidate every refresh token issued before this change.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.userRepository.save(user);
    return { message: 'Password changed successfully' };
  }

  /**
   * Log out by invalidating every refresh token issued to this user so far.
   * Clearing the cookie only removes the browser's copy; a token already
   * captured elsewhere would otherwise stay valid for its full lifetime.
   *
   * tokenVersion is per-user, so this is "log out everywhere". Per-device
   * logout would require a jti denylist / sessions table.
   */
  async logout(userId: string): Promise<{ message: string }> {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      isSuperAdmin: user.isSuperAdmin,
      tokenVersion: user.tokenVersion ?? 0,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_EXPIRATION', '15m'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET', 'refresh-secret'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId: user.tenantId,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }
}
