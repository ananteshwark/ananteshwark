import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StudioService } from './studio.service';
import { ApiKeyStatus } from './entities/studio.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn((x: any) => Promise.resolve(x)),
});

const T0 = Date.parse('2026-07-10T09:00:00Z');

describe('StudioService', () => {
  let service: StudioService;
  let keyRepo: any, tableRepo: any, rowRepo: any, automation: any;

  beforeEach(() => {
    keyRepo = mockRepo(); tableRepo = mockRepo(); rowRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new StudioService(keyRepo, tableRepo, rowRepo, automation);
  });

  describe('API keys', () => {
    it('mints a key returning a plaintext that hashes to the stored value', async () => {
      const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['reports:read'] });
      expect(plaintext.startsWith(apiKey.prefix + '.')).toBe(true);
      expect(apiKey.hashedKey).not.toContain(plaintext); // stored hashed, not plaintext
      expect(apiKey.scopes).toEqual(['reports:read']);
    });

    it('resolves a valid key and rejects a tampered one', async () => {
      const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI' });
      keyRepo.findOne.mockResolvedValue(apiKey);
      await expect(service.resolveKey(plaintext, '2026-07-10')).resolves.toMatchObject({ id: apiKey.id });
      await expect(service.resolveKey(`${apiKey.prefix}.wrong`, '2026-07-10')).rejects.toThrow(ForbiddenException);
    });

    it('rejects a revoked or expired key', async () => {
      const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI' });
      keyRepo.findOne.mockResolvedValue({ ...apiKey, status: ApiKeyStatus.REVOKED });
      await expect(service.resolveKey(plaintext, '2026-07-10')).rejects.toThrow(ForbiddenException);
      keyRepo.findOne.mockResolvedValue({ ...apiKey, expiresAt: '2026-01-01' });
      await expect(service.resolveKey(plaintext, '2026-07-10')).rejects.toThrow(ForbiddenException);
    });

    describe('authorize (scope + quota)', () => {
      it('enforces the required scope', async () => {
        const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['lookup:read'] });
        keyRepo.findOne.mockResolvedValue(apiKey);
        await expect(service.authorize(plaintext, 'reports:read', T0)).rejects.toThrow(ForbiddenException);
      });

      it('consumes quota and reports remaining', async () => {
        const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['*'], quotaPerDay: 3 });
        keyRepo.findOne.mockResolvedValue({ ...apiKey, usageCount: 0, usageWindowStart: new Date(T0) });
        const res = await service.authorize(plaintext, 'reports:read', T0 + 1000);
        expect(res.remaining).toBe(2);
      });

      it('fires a quota alert once the threshold is crossed', async () => {
        const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['*'], quotaPerDay: 10, alertThresholdPct: 80 });
        keyRepo.findOne.mockResolvedValue({ ...apiKey, usageCount: 7, usageWindowStart: new Date(T0), alertSent: false });
        const res = await service.authorize(plaintext, 'reports:read', T0 + 1000); // usage → 8 = 80%
        expect(res.alert).toBe(true);
        expect(automation.emit).toHaveBeenCalledWith('t1', 'apikey.quota_alert', expect.objectContaining({ keyId: apiKey.id }));
      });

      it('blocks once the quota is exhausted', async () => {
        const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['*'], quotaPerDay: 2 });
        keyRepo.findOne.mockResolvedValue({ ...apiKey, usageCount: 2, usageWindowStart: new Date(T0) });
        await expect(service.authorize(plaintext, 'reports:read', T0 + 1000)).rejects.toThrow(ForbiddenException);
      });

      it('resets the counter after the 24h window elapses', async () => {
        const { apiKey, plaintext } = await service.createKey('t1', { name: 'CI', scopes: ['*'], quotaPerDay: 5 });
        keyRepo.findOne.mockResolvedValue({ ...apiKey, usageCount: 5, usageWindowStart: new Date(T0 - 25 * 3600 * 1000) });
        const res = await service.authorize(plaintext, 'reports:read', T0);
        expect(res.remaining).toBe(4); // window rolled, count reset to 0 then +1
      });
    });
  });

  describe('lookup tables', () => {
    it('upserts a row keyed by the first column', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 'lt1', tenantId: 't1', columns: [{ key: 'code' }, { key: 'gl' }] });
      rowRepo.findOne.mockResolvedValue(null);
      const row = await service.upsertRow('t1', 'cost_centres', { code: 'CC100', gl: '4000' });
      expect(row).toMatchObject({ lookupKey: 'CC100', values: { code: 'CC100', gl: '4000' } });
    });

    it('requires a value for the key column', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 'lt1', tenantId: 't1', columns: [{ key: 'code' }] });
      await expect(service.upsertRow('t1', 'cost_centres', { gl: '4000' })).rejects.toThrow(BadRequestException);
    });

    it('resolves a lookup value by key', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 'lt1', tenantId: 't1', columns: [{ key: 'code' }] });
      rowRepo.findOne.mockResolvedValue({ values: { code: 'CC100', gl: '4000' } });
      expect(await service.lookup('t1', 'cost_centres', 'CC100')).toEqual({ code: 'CC100', gl: '4000' });
    });

    it('rejects a duplicate table key', async () => {
      tableRepo.findOne.mockResolvedValue({ id: 'lt1' });
      await expect(service.createTable('t1', { key: 'cc', name: 'CC', columns: [{ key: 'code' }] })).rejects.toThrow(BadRequestException);
    });
  });
});
