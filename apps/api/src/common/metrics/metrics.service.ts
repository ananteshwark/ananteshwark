import { Injectable } from '@nestjs/common';

interface RouteStats {
  count: number;
  errors4xx: number;
  errors5xx: number;
  totalMs: number;
  maxMs: number;
}

/**
 * In-memory golden-signals registry, rendered in Prometheus text exposition
 * format. Deliberately dependency-free: counters and per-route latency
 * aggregates cover request rate, error rate, and duration; a real TSDB can
 * scrape /metrics without the app needing a client library.
 */
@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly routes = new Map<string, RouteStats>();

  /** Collapse ids so route cardinality stays bounded. */
  private normalizePath(path: string): string {
    return (path.split('?')[0] || '/')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+(\/|$)/g, '/:id$1');
  }

  record(method: string, path: string, statusCode: number, durationMs: number): void {
    const key = `${method} ${this.normalizePath(path)}`;
    const stats = this.routes.get(key) ?? { count: 0, errors4xx: 0, errors5xx: 0, totalMs: 0, maxMs: 0 };
    stats.count += 1;
    if (statusCode >= 500) stats.errors5xx += 1;
    else if (statusCode >= 400) stats.errors4xx += 1;
    stats.totalMs += durationMs;
    if (durationMs > stats.maxMs) stats.maxMs = durationMs;
    this.routes.set(key, stats);
  }

  snapshot() {
    let count = 0, errors4xx = 0, errors5xx = 0, totalMs = 0;
    for (const s of this.routes.values()) {
      count += s.count;
      errors4xx += s.errors4xx;
      errors5xx += s.errors5xx;
      totalMs += s.totalMs;
    }
    return {
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requests: count,
      errors4xx,
      errors5xx,
      avgLatencyMs: count ? Math.round(totalMs / count) : 0,
      routes: this.routes.size,
    };
  }

  /** Prometheus text exposition format (type 0.0.4). */
  renderPrometheus(): string {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const lines: string[] = [
      '# HELP app_uptime_seconds Seconds since process start',
      '# TYPE app_uptime_seconds gauge',
      `app_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`,
      '# HELP http_requests_total Requests by route and class',
      '# TYPE http_requests_total counter',
    ];
    for (const [route, s] of this.routes) {
      const label = `route="${esc(route)}"`;
      lines.push(`http_requests_total{${label},class="all"} ${s.count}`);
      if (s.errors4xx) lines.push(`http_requests_total{${label},class="4xx"} ${s.errors4xx}`);
      if (s.errors5xx) lines.push(`http_requests_total{${label},class="5xx"} ${s.errors5xx}`);
    }
    lines.push(
      '# HELP http_request_duration_ms_sum Total request time per route',
      '# TYPE http_request_duration_ms_sum counter',
    );
    for (const [route, s] of this.routes) {
      lines.push(`http_request_duration_ms_sum{route="${esc(route)}"} ${Math.round(s.totalMs)}`);
      lines.push(`http_request_duration_ms_count{route="${esc(route)}"} ${s.count}`);
      lines.push(`http_request_duration_ms_max{route="${esc(route)}"} ${Math.round(s.maxMs)}`);
    }
    return lines.join('\n') + '\n';
  }
}
