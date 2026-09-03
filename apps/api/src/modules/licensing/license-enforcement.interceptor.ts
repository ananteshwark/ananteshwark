import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { LicenseEnforcementService } from './license-enforcement.service';

/**
 * Global license gate. Runs as an interceptor (not a guard) so it executes
 * after the controller-scoped JwtAuthGuard has attached `request.user` —
 * global guards would run before authentication and see no tenant.
 * Unauthenticated requests pass through untouched; degraded-but-allowed
 * access surfaces as an `X-License-Warning` response header.
 */
@Injectable()
export class LicenseEnforcementInterceptor implements NestInterceptor {
  constructor(private readonly enforcement: LicenseEnforcementService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest();
    const tenantId = request?.user?.tenantId;
    if (!tenantId) return next.handle();

    const decision = await this.enforcement.checkRequest(tenantId, request.path ?? request.url ?? '');
    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason ?? 'License check failed');
    }
    if (decision.warning) {
      const response = context.switchToHttp().getResponse();
      if (typeof response?.setHeader === 'function') {
        response.setHeader('X-License-Warning', decision.warning);
      }
    }
    return next.handle();
  }
}
