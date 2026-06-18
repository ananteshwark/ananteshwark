import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const resourceType = this.reflector.get<string>(AUDIT_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!resourceType || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const user = request.user;
    const tenant = request.tenant;

    return next.handle().pipe(
      tap((data) => {
        if (user && tenant) {
          this.auditService
            .log({
              tenantId: tenant.id,
              userId: user.id,
              userEmail: user.email,
              action: method,
              resourceType,
              resourceId: data?.id || request.params?.id,
              newValues: method !== 'DELETE' ? data : null,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
            })
            .catch(() => {});
        }
      }),
    );
  }
}
