import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// Allows access only to platform super admins. Used to protect cross-tenant
// administration endpoints (tenant + license management).
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super admin access required');
    }
    return true;
  }
}
