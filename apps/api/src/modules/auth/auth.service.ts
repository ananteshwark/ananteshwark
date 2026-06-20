import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserStatus } from '../users/entities/user.entity';
import { TenantsService } from '../tenants/tenants.service';
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

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password, dto.tenantSlug);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.generateTokens(user);
    const tenant = await this.tenantsService.findById(user.tenantId);
    return { ...tokens, tenant };
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
      tenant,
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
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    // In production: generate token, store in Redis, send email
    return { message: 'If an account exists with that email, a password reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    // In production: verify token from Redis, update password, invalidate token
    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, tenantId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new UnauthorizedException();

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.save(user);
    return { message: 'Password changed successfully' };
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, tenantId: user.tenantId, isSuperAdmin: user.isSuperAdmin };
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
