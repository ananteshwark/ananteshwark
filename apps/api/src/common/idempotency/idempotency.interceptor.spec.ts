import { of, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const makeContext = (req: any, res: any = { setHeader: jest.fn() }) => ({
  switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
}) as any;

describe('IdempotencyInterceptor', () => {
  let repo: any;
  let interceptor: IdempotencyInterceptor;
  const handler = { handle: jest.fn(() => of({ id: 'created-1' })) };

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: any) => x),
      save: jest.fn().mockResolvedValue({}),
    };
    handler.handle.mockClear();
    handler.handle.mockReturnValue(of({ id: 'created-1' }));
    interceptor = new IdempotencyInterceptor(repo);
  });

  const baseReq = {
    method: 'POST',
    originalUrl: '/expenses/claims?verbose=1',
    headers: { 'idempotency-key': 'abc-123' },
    user: { id: 'u1', tenantId: 't1' },
  };

  it('passes through requests without the header, untouched', async () => {
    const req = { ...baseReq, headers: {} };
    const result = await lastValueFrom(interceptor.intercept(makeContext(req), handler as any));
    expect(result).toEqual({ id: 'created-1' });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('first execution runs the handler and stores the response', async () => {
    const result = await lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any));
    expect(result).toEqual({ id: 'created-1' });
    expect(handler.handle).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      path: '/expenses/claims', // query string excluded from scope
      responseBody: { id: 'created-1' },
    }));
  });

  it('a retry with the same key replays the stored response without re-executing', async () => {
    repo.findOne.mockResolvedValue({ responseBody: { id: 'created-1' } });
    const res = { setHeader: jest.fn() };
    const result = await lastValueFrom(interceptor.intercept(makeContext(baseReq, res), handler as any));
    expect(result).toEqual({ id: 'created-1' });
    expect(handler.handle).not.toHaveBeenCalled(); // no double-create
    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
  });

  it('different keys map to different scopes', async () => {
    await lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any));
    const other = { ...baseReq, headers: { 'idempotency-key': 'other-456' } };
    await lastValueFrom(interceptor.intercept(makeContext(other), handler as any));
    const hashes = repo.save.mock.calls.map((c: any) => c[0].scopeHash);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('GET requests are never intercepted even with a key', async () => {
    const req = { ...baseReq, method: 'GET' };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler as any));
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
