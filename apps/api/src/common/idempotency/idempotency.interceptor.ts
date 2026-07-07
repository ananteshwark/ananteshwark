import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { createHash } from 'crypto';
import { IdempotencyKey } from './idempotency-key.entity';

/**
 * Opt-in idempotent replay for mutating requests.
 *
 * A client that sends `Idempotency-Key: <token>` on a POST gets exactly-once
 * semantics: the first execution stores its response; any retry with the same
 * key (same user, method, path) replays that stored response instead of
 * re-running the handler. Requests without the header are untouched.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keyRepo: Repository<IdempotencyKey>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const clientKey = req.headers?.['idempotency-key'];
    const tenantId = req.user?.tenantId ?? req.tenantId;
    if (!clientKey || req.method !== 'POST' || !tenantId) return next.handle();

    const path = (req.originalUrl || req.url || '').split('?')[0];
    const scopeHash = createHash('sha256')
      .update(`${req.user?.id ?? ''}|${req.method}|${path}|${clientKey}`)
      .digest('hex');

    return from(this.keyRepo.findOne({ where: { tenantId, scopeHash } })).pipe(
      switchMap((existing) => {
        if (existing) {
          const res = context.switchToHttp().getResponse();
          res.setHeader?.('X-Idempotent-Replay', 'true');
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          tap((body) => {
            // Persist best-effort: a racing duplicate hits the unique index
            // and loses — the stored winner is what future retries replay.
            this.keyRepo
              .save(this.keyRepo.create({ tenantId, scopeHash, method: req.method, path, responseBody: body ?? null }))
              .catch(() => undefined);
          }),
        );
      }),
    );
  }
}
