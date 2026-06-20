import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class VendorAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Vendor token required');
    }

    const token = authHeader.split(' ')[1];
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'default-secret');
      const payload = this.jwtService.verify(token, { secret });

      if (payload.type !== 'vendor' || !payload.vendorId) {
        throw new UnauthorizedException('Invalid vendor token');
      }

      (request as any).vendor = {
        vendorId: payload.vendorId,
        vendorName: payload.vendorName,
        tenantId: payload.tenantId,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired vendor token');
    }
  }
}
