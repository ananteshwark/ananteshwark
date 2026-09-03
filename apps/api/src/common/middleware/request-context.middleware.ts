import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Request tracing + access log + metrics feed.
 *
 * - Every request gets an X-Request-ID (an incoming one from a trusted proxy
 *   is propagated) so a support ticket can be correlated across logs.
 * - One structured access-log line per request on finish.
 * - Feeds the in-memory metrics registry that backs GET /metrics.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string)?.slice(0, 64) || randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      this.metrics.record(req.method, req.originalUrl || req.url, res.statusCode, ms);
      // Health checks and metrics scrapes would drown the log — skip them.
      const path = (req.originalUrl || req.url).split('?')[0];
      if (path === '/health' || path === '/metrics') return;
      const tenantId = (req as any).tenantId || req.headers['x-tenant-id'] || '-';
      const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms tenant=${tenantId} rid=${requestId}`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
