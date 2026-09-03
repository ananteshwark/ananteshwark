import { Controller, Post, Get, Body, UseGuards, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  MfaVerifyDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// The refresh token is long-lived, so the browser receives it as an httpOnly
// cookie (unreadable by JS, so XSS can't exfiltrate it) rather than storing it.
// Non-browser clients still get it in the response body and may send it back
// in the request body. Cookie is scoped to the auth path and only sent over
// HTTPS in production.
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
const DEFAULT_REFRESH_EXPIRATION = '7d';

/**
 * Parse a JWT-style duration ('900s', '15m', '7d') into milliseconds so the
 * cookie's lifetime is derived from the same JWT_REFRESH_EXPIRATION setting as
 * the token itself, instead of drifting from a hardcoded constant.
 */
export function refreshMaxAgeMs(expiration: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec((expiration ?? '').trim());
  if (!match) return refreshMaxAgeMs(DEFAULT_REFRESH_EXPIRATION);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] ?? 's'];
  return Number(match[1]) * unit;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, result: any): void {
    if (!result?.refreshToken) return;
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: this.config.get('APP_ENV') === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshMaxAgeMs(
        this.config.get('JWT_REFRESH_EXPIRATION', DEFAULT_REFRESH_EXPIRATION),
      ),
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  // Read the refresh cookie without the cookie-parser dependency.
  private readRefreshCookie(req: Request): string | undefined {
    const raw = req.headers?.cookie;
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
    }
    return undefined;
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Returns access and refresh tokens' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result);
    return result;
  }

  @Public()
  @Post('mfa/verify')
  @ApiOperation({ summary: 'Complete an MFA login with a TOTP code' })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyMfa(dto.mfaToken, dto.code);
    this.setRefreshCookie(res, result);
    return result;
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new tenant and admin user' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result);
    return result;
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Prefer the httpOnly cookie (browser); fall back to the body (API clients).
    const refreshToken = this.readRefreshCookie(req) ?? dto?.refreshToken;
    const result = await this.authService.refreshToken({ refreshToken });
    this.setRefreshCookie(res, result);
    return result;
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user and tenant' })
  me(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id, user.tenantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiOperation({ summary: 'Change password (authenticated)' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, user.tenantId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout' })
  logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
    this.clearRefreshCookie(res);
    // Also revoke server-side: clearing the cookie alone leaves any captured
    // copy of the refresh token usable until it expires.
    return this.authService.logout(user.id);
  }
}
