import { BadRequestException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { DeliveryAdapter } from './delivery.adapter';
import { DeliveryType, ApiSourceType } from './entities/integration.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let scriptRepo: any, jobRepo: any, apiRepo: any, delivery: DeliveryAdapter, studio: any;

  beforeEach(() => {
    scriptRepo = mockRepo(); jobRepo = mockRepo(); apiRepo = mockRepo();
    delivery = new DeliveryAdapter();
    studio = { listRows: jest.fn().mockResolvedValue([{ values: { code: 'CC1' } }]) };
    service = new IntegrationsService(scriptRepo, jobRepo, apiRepo, delivery, studio);
  });

  describe('runPipeline (safe DSL)', () => {
    const rows = [
      { dept: 'Eng', salary: 100, active: true },
      { dept: 'Eng', salary: 200, active: true },
      { dept: 'Ops', salary: 50, active: false },
    ];

    it('filters, selects, and limits', () => {
      const out = IntegrationsService.runPipeline([
        { op: 'filter', field: 'active', cmp: 'eq', value: true },
        { op: 'select', fields: ['dept', 'salary'] },
        { op: 'limit', n: 1 },
      ], rows);
      expect(out).toEqual([{ dept: 'Eng', salary: 100 }]);
    });

    it('maps a computed field via safe arithmetic', () => {
      const out = IntegrationsService.runPipeline([
        { op: 'map', outputField: 'annual', expr: { op: '*', a: { field: 'salary' }, b: { const: 12 } } },
      ], [{ salary: 100 }]);
      expect(out[0].annual).toBe(1200);
    });

    it('aggregates with group-by', () => {
      const out = IntegrationsService.runPipeline([
        { op: 'filter', field: 'active', cmp: 'eq', value: true },
        { op: 'aggregate', groupBy: 'dept', measure: 'salary', agg: 'sum' },
      ], rows);
      expect(out).toEqual([{ dept: 'Eng', sum_salary: 300 }]);
    });

    it('sorts descending', () => {
      const out = IntegrationsService.runPipeline([{ op: 'sort', field: 'salary', dir: 'desc' }], rows);
      expect(out.map((r) => r.salary)).toEqual([200, 100, 50]);
    });

    it('rejects an unsupported op', () => {
      expect(() => IntegrationsService.runPipeline([{ op: 'exec', code: 'rm -rf' }], rows)).toThrow(BadRequestException);
    });

    it('rejects an unsupported expression op', () => {
      expect(() => IntegrationsService.evalExpr({ op: '**', a: { const: 2 }, b: { const: 3 } }, {})).toThrow(BadRequestException);
    });
  });

  describe('scripts', () => {
    it('validates the pipeline on create (bad op rejected)', async () => {
      scriptRepo.findOne.mockResolvedValue(null);
      await expect(service.createScript('t1', { key: 'k', name: 'K', steps: [{ op: 'nope' }] })).rejects.toThrow(BadRequestException);
    });

    it('creates and runs a stored script', async () => {
      scriptRepo.findOne.mockResolvedValueOnce(null); // create dup-check
      const created = await service.createScript('t1', { key: 'k', name: 'K', steps: [{ op: 'limit', n: 1 }] });
      expect(created.key).toBe('k');
      scriptRepo.findOne.mockResolvedValue({ tenantId: 't1', key: 'k', steps: [{ op: 'limit', n: 1 }] });
      expect(await service.runScript('t1', 'k', [{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }]);
    });
  });

  describe('scheduling & delivery seam', () => {
    it('runs a job, rolls nextRunAt forward and reports the delivery seam result', async () => {
      jobRepo.findOne.mockResolvedValue({ id: 'j1', tenantId: 't1', scriptKey: 'k', intervalMinutes: 60, deliveryType: DeliveryType.SFTP, deliveryConfig: { host: 'sftp.example.com' } });
      scriptRepo.findOne.mockResolvedValue({ tenantId: 't1', key: 'k', steps: [] });
      const now = new Date('2026-07-11T09:00:00Z');
      const { job, delivery: del } = await service.runJob('t1', 'j1', [{ a: 1 }], now);
      expect(job.nextRunAt).toEqual(new Date('2026-07-11T10:00:00Z'));
      // No transport wired → delivered:false with a reason, but no throw.
      expect(del).toMatchObject({ delivered: false, transport: DeliveryType.SFTP });
    });

    it('delivery seam validates the target config', async () => {
      expect(await delivery.deliver(DeliveryType.SFTP, {}, [])).toMatchObject({ delivered: false, reason: expect.stringMatching(/host/) });
      expect(await delivery.deliver(DeliveryType.NONE, {}, [])).toMatchObject({ delivered: false });
    });
  });

  describe('API builder', () => {
    it('resolves a lookup-table-backed API to row values', async () => {
      apiRepo.findOne.mockResolvedValue({ tenantId: 't1', path: 'costcentres', sourceType: ApiSourceType.LOOKUP_TABLE, sourceRef: 'cc', active: true });
      const out = await service.resolveApi('t1', 'costcentres');
      expect(out).toEqual([{ code: 'CC1' }]);
      expect(studio.listRows).toHaveBeenCalledWith('t1', 'cc');
    });

    it('resolves a script-backed API over input rows', async () => {
      apiRepo.findOne.mockResolvedValue({ tenantId: 't1', path: 'top', sourceType: ApiSourceType.SCRIPT, sourceRef: 'k', active: true });
      scriptRepo.findOne.mockResolvedValue({ tenantId: 't1', key: 'k', steps: [{ op: 'limit', n: 1 }] });
      expect(await service.resolveApi('t1', 'top', [{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }]);
    });
  });
});
