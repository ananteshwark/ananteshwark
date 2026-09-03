import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, from, of, throwError } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { createHash } from 'crypto';
import { IdempotencyKey } from './idempotency-key.entity';

/**
 * Opt-in idempotent replay for mutating requests.
 *
 * A client that sends `Idempotency-Key: <token>` on a POST gets exactly-once
 * semantics: the first execution stores its response; any retry with the same
 * key (same user, method, path) replays that stored response instead of
 * re-running the handler. Requests without the header are untouched.
 *
 * The slot is RESERVED BEFORE the handler runs, via an insert that relies on
 * the unique (tenant_id, scope_hash) index. Reserving afterwards would let two
 * concurrent requests both find "no key yet" and both execute the side effect —
 * which is precisely the double-submit / client-retry case idempotency keys
 * exist to prevent. The loser of the race gets a replay if the winner already
 * finished, or 409 while it is still in flight. A handler that throws releases
 * its reservation so the client can retry with the same key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keyRepo: Repository<IdempotencyKey>,
  ) {}

  /** Atomically claim the slot. False means another request already holds it. */
  private async reserve(
    tenantId: string,
    scopeHash: string,
    method: string,
    path: string,
  ): Promise<boolean> {
    try {
      await this.keyRepo.insert({
        tenantId,
        scopeHash,
        method,
        path,
        status: 'in_progress',
        responseBody: null,
      } as Partial<IdempotencyKey>);
      return true;
    } catch (err: any) {
      const code = err?.code ?? err?.driverError?.code;
      if (code === '23505') return false; // unique violation: someone else won
      throw err;
    }
  }

  private complete(tenantId: string, scopeHash: string, body: any): Promise<unknown> {
    return this.keyRepo.update(
      { tenantId, scopeHash },
      { status: 'done', responseBody: body ?? null } as any,
    );
  }

  /** Failed handler: free the slot so the same key can be retried. */
  private release(tenantId: string, scopeHash: string): Promise<unknown> {
    return this.keyRepo.delete({ tenantId, scopeHash });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const clientKey = req.headers?.['idempotency-key'];
    const tenantId = req.user?.tenantId ?? req.tenantId;
    if (!clientKey || req.method !== 'POST' || !tenantId) return next.handle();

    const path = (req.originalUrl || req.url || '').split('?')[0];
    const scopeHash = createHash('sha256')
      .update(`${req.user?.id ?? ''}|${req.method}|${path}|${clientKey}`)
      .digest('hex');

    return from(this.reserve(tenantId, scopeHash, req.method, path)).pipe(
      switchMap((won) => {
        if (!won) return this.replayOrConflict(context, tenantId, scopeHash);

        return next.handle().pipe(
          // Persist the outcome BEFORE emitting, so an immediate retry replays
          // rather than racing an in-flight write.
          switchMap((body) =>
            from(this.complete(tenantId, scopeHash, body)).pipe(map(() => body)),
          ),
          catchError((err) =>
            from(this.release(tenantId, scopeHash)).pipe(
              switchMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
    );
  }

  private replayOrConflict(
    context: ExecutionContext,
    tenantId: string,
    scopeHash: string,
  ): Observable<any> {
    return from(this.keyRepo.findOne({ where: { tenantId, scopeHash } })).pipe(
      switchMap((existing) => {
        if (existing && existing.status === 'done') {
          const res = context.switchToHttp().getResponse();
          res.setHeader?.('X-Idempotent-Replay', 'true');
          return of(existing.responseBody);
        }
        // Still in flight (or vanished between insert and read).
        return throwError(
          () =>
            new ConflictException(
              'A request with this Idempotency-Key is already in progress',
            ),
        );
      }),
    );
  }
}
