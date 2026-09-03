import { of, throwError, lastValueFrom } from 'rxjs';
import { ConflictException } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const makeContext = (req: any, res: any = { setHeader: jest.fn() }) => ({
  switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
}) as any;

const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

describe('IdempotencyInterceptor', () => {
  let repo: any;
  let interceptor: IdempotencyInterceptor;
  const handler = { handle: jest.fn(() => of({ id: 'created-1' })) };

  beforeEach(() => {
    repo = {
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
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
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('GET requests are never intercepted even with a key', async () => {
    const req = { ...baseReq, method: 'GET' };
    await lastValueFrom(interceptor.intercept(makeContext(req), handler as any));
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('reserves the key BEFORE running the handler, then stores the response', async () => {
    const result = await lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any));
    expect(result).toEqual({ id: 'created-1' });

    // Reservation happens first, and carries the in-flight marker.
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      path: '/expenses/claims', // query string excluded from scope
      status: 'in_progress',
    }));
    expect(repo.insert.mock.invocationCallOrder[0])
      .toBeLessThan(handler.handle.mock.invocationCallOrder[0]);

    // Outcome recorded on success.
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1' }),
      expect.objectContaining({ status: 'done', responseBody: { id: 'created-1' } }),
    );
  });

  it('a concurrent duplicate does NOT execute the handler and gets 409 while in flight', async () => {
    repo.insert.mockRejectedValue(uniqueViolation());          // lost the race
    repo.findOne.mockResolvedValue({ status: 'in_progress' }); // winner still running

    await expect(
      lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handler.handle).not.toHaveBeenCalled(); // the critical guarantee
  });

  it('a retry after completion replays the stored response without re-executing', async () => {
    repo.insert.mockRejectedValue(uniqueViolation());
    repo.findOne.mockResolvedValue({ status: 'done', responseBody: { id: 'created-1' } });
    const res = { setHeader: jest.fn() };

    const result = await lastValueFrom(interceptor.intercept(makeContext(baseReq, res), handler as any));
    expect(result).toEqual({ id: 'created-1' });
    expect(handler.handle).not.toHaveBeenCalled(); // no double-create
    expect(res.setHeader).toHaveBeenCalledWith('X-Idempotent-Replay', 'true');
  });

  it('releases the reservation when the handler fails, so the key can be retried', async () => {
    const boom = new Error('handler blew up');
    handler.handle.mockReturnValue(throwError(() => boom));

    await expect(
      lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any)),
    ).rejects.toBe(boom);
    expect(repo.delete).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }));
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('a non-unique-violation insert error propagates instead of silently re-running', async () => {
    repo.insert.mockRejectedValue(Object.assign(new Error('db down'), { code: '08006' }));
    await expect(
      lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any)),
    ).rejects.toThrow('db down');
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('different keys map to different scopes', async () => {
    await lastValueFrom(interceptor.intercept(makeContext(baseReq), handler as any));
    const other = { ...baseReq, headers: { 'idempotency-key': 'other-456' } };
    await lastValueFrom(interceptor.intercept(makeContext(other), handler as any));
    const hashes = repo.insert.mock.calls.map((c: any) => c[0].scopeHash);
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
