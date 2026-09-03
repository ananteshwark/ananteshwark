import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => { service = new MetricsService(); });

  it('aggregates request counts, error classes, and latency', () => {
    service.record('GET', '/hr/employees', 200, 12);
    service.record('GET', '/hr/employees', 200, 20);
    service.record('POST', '/expenses/claims', 400, 5);
    service.record('GET', '/finance/gl', 500, 100);
    const snap = service.snapshot();
    expect(snap.requests).toBe(4);
    expect(snap.errors4xx).toBe(1);
    expect(snap.errors5xx).toBe(1);
    expect(snap.avgLatencyMs).toBe(Math.round((12 + 20 + 5 + 100) / 4));
  });

  it('normalizes UUIDs and numeric ids so route cardinality stays bounded', () => {
    service.record('GET', '/travel/requests/6f9619ff-8b86-4d01-b42d-00cf4fc964ff', 200, 3);
    service.record('GET', '/travel/requests/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 200, 4);
    service.record('GET', '/items/12345', 200, 1);
    service.record('GET', '/items/999', 200, 1);
    const text = service.renderPrometheus();
    expect(text).toContain('GET /travel/requests/:id');
    expect(text).not.toContain('6f9619ff');
    expect(text).toContain('GET /items/:id');
    expect(service.snapshot().routes).toBe(2); // two normalized routes, not four
  });

  it('renders valid Prometheus text exposition', () => {
    service.record('GET', '/health?probe=1', 200, 2);
    const text = service.renderPrometheus();
    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('http_requests_total{route="GET /health",class="all"} 1');
    expect(text).toContain('app_uptime_seconds');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('strips query strings before grouping', () => {
    service.record('GET', '/search?q=abc', 200, 1);
    service.record('GET', '/search?q=def', 200, 1);
    expect(service.snapshot().routes).toBe(1);
  });
});
