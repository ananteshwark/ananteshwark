import { FieldConfigService } from './field-config.service';
import { FIELD_DEFAULTS } from './field-defaults';

/**
 * Field configuration: defaults merge with tenant overrides (enabled/required/
 * customLabel), upsert round-trip, and the flattened config map.
 */
describe('FieldConfigService', () => {
  let service: FieldConfigService;
  let repo: any;

  const firstModule = Object.keys(FIELD_DEFAULTS)[0];
  const firstField = FIELD_DEFAULTS[firstModule][0];

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    service = new FieldConfigService(repo);
  });

  it('returns pure defaults when the tenant has no overrides', async () => {
    const cfg = await service.getModuleConfig('t1', firstModule);
    expect(cfg.length).toBe(FIELD_DEFAULTS[firstModule].length);
    expect(cfg[0]).toMatchObject({
      field: firstField.field,
      enabled: firstField.enabled,
      required: firstField.required,
      customLabel: null,
    });
  });

  it('tenant overrides win over defaults', async () => {
    repo.find.mockResolvedValue([
      { field: firstField.field, enabled: !firstField.enabled, required: !firstField.required, customLabel: 'Renamed' },
    ]);
    const cfg = await service.getModuleConfig('t1', firstModule);
    expect(cfg[0]).toMatchObject({
      enabled: !firstField.enabled,
      required: !firstField.required,
      customLabel: 'Renamed',
    });
  });

  it('an unknown module yields an empty config, not an error', async () => {
    expect(await service.getModuleConfig('t1', 'not-a-module')).toEqual([]);
  });

  it('updateModuleConfig upserts each item keyed by tenant+module+field', async () => {
    await service.updateModuleConfig('t1', firstModule, [
      { field: firstField.field, enabled: false, required: false, customLabel: 'X' } as any,
    ]);
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', module: firstModule, field: firstField.field, enabled: false }),
      { conflictPaths: ['tenantId', 'module', 'field'] },
    );
  });

  it('getConfigMap flattens to field → {enabled, required, label} with customLabel preferred', async () => {
    repo.find.mockResolvedValue([
      { field: firstField.field, enabled: true, required: true, customLabel: 'Custom' },
    ]);
    const map = await service.getConfigMap('t1', firstModule);
    expect(map[firstField.field]).toEqual({ enabled: true, required: true, label: 'Custom' });
  });
});
