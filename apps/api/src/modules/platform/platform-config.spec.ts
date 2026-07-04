import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks/webhooks.service';
import { CustomFieldsService } from './custom-fields/custom-fields.service';
import { CustomFieldType, CustomFieldEntityType } from './custom-fields/entities/custom-field-definition.entity';

/**
 * Platform config plumbing.
 * Webhooks: secret generation/rotation, event-type + wildcard matching on
 * dispatch, cascade delete of deliveries.
 * Custom fields: fieldKey slugging + validation, per-entity uniqueness,
 * option requirement for choice fields, typed value casting with defaults.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  remove: jest.fn().mockResolvedValue(undefined),
});

describe('WebhooksService', () => {
  let service: WebhooksService;
  let subRepo: any, delRepo: any;

  beforeEach(() => {
    subRepo = mockRepo(); delRepo = mockRepo();
    service = new WebhooksService(subRepo, delRepo);
    // dispatch delivers over HTTP; keep the network out of unit tests
    jest.spyOn(service as any, 'attemptDelivery').mockResolvedValue(undefined);
  });

  it('createSubscription generates a hex secret and defaults', async () => {
    const sub = await service.createSubscription('t1', {
      name: 'CI hook', targetUrl: 'https://x/y', eventTypes: ['po.approved'],
    } as any);
    expect(sub.secret).toMatch(/^[0-9a-f]{48}$/);
    expect(sub.isActive).toBe(true);
    expect(sub.maxRetries).toBe(3);
  });

  it('rotateSecret replaces the secret', async () => {
    const sub: any = { id: 's1', tenantId: 't1', secret: 'old' };
    subRepo.findOne.mockResolvedValue(sub);
    await service.rotateSecret('t1', 's1');
    expect(sub.secret).not.toBe('old');
    expect(sub.secret).toMatch(/^[0-9a-f]{48}$/);
  });

  it('dispatch targets only active subscriptions matching the event (or wildcard)', async () => {
    subRepo.find.mockResolvedValue([
      { id: 's1', eventTypes: ['po.approved'] },
      { id: 's2', eventTypes: ['*'] },
      { id: 's3', eventTypes: ['leave.approved'] },
    ]);
    await service.dispatch('t1', 'po.approved', { poId: 'p1' });
    const delivered = (service as any).attemptDelivery.mock.calls.map((c: any[]) => c[0].id);
    expect(delivered.sort()).toEqual(['s1', 's2']);
    // only active subs are even fetched
    expect(subRepo.find).toHaveBeenCalledWith({ where: { tenantId: 't1', isActive: true } });
  });

  it('deleteSubscription cascades its delivery log', async () => {
    subRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1' });
    await service.deleteSubscription('t1', 's1');
    expect(delRepo.delete).toHaveBeenCalledWith({ subscriptionId: 's1' });
    expect(subRepo.remove).toHaveBeenCalled();
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.getSubscription('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(subRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  let defRepo: any, valRepo: any;

  beforeEach(() => {
    defRepo = mockRepo(); valRepo = mockRepo();
    service = new CustomFieldsService(defRepo, valRepo);
  });

  it('createDefinition slugs the key and rejects invalid slugs', async () => {
    const def = await service.createDefinition('t1', {
      entityType: CustomFieldEntityType.EMPLOYEE, fieldKey: 'Shirt Size', fieldLabel: 'Shirt size', fieldType: CustomFieldType.TEXT,
    } as any);
    expect(def.fieldKey).toBe('shirt_size');

    await expect(service.createDefinition('t1', {
      entityType: CustomFieldEntityType.EMPLOYEE, fieldKey: '1bad', fieldLabel: 'X', fieldType: CustomFieldType.TEXT,
    } as any)).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate keys per entity type and optionless dropdowns', async () => {
    defRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createDefinition('t1', {
      entityType: CustomFieldEntityType.EMPLOYEE, fieldKey: 'dupe', fieldLabel: 'X', fieldType: CustomFieldType.TEXT,
    } as any)).rejects.toThrow(ConflictException);

    defRepo.findOne.mockResolvedValue(null);
    await expect(service.createDefinition('t1', {
      entityType: CustomFieldEntityType.EMPLOYEE, fieldKey: 'size', fieldLabel: 'X', fieldType: CustomFieldType.DROPDOWN, options: [],
    } as any)).rejects.toThrow('at least one option');
  });

  it('getEntityValues casts stored strings by type and falls back to defaults', async () => {
    defRepo.find.mockResolvedValue([
      { id: 'd1', fieldKey: 'age', fieldType: CustomFieldType.NUMBER, defaultValue: null },
      { id: 'd2', fieldKey: 'vip', fieldType: CustomFieldType.CHECKBOX, defaultValue: null },
      { id: 'd3', fieldKey: 'tags', fieldType: CustomFieldType.MULTI_SELECT, defaultValue: null },
      { id: 'd4', fieldKey: 'color', fieldType: CustomFieldType.TEXT, defaultValue: 'blue' },
    ]);
    valRepo.find.mockResolvedValue([
      { fieldDefinitionId: 'd1', value: '42' },
      { fieldDefinitionId: 'd2', value: 'true' },
      { fieldDefinitionId: 'd3', value: '["a","b"]' },
    ]);
    const vals = await service.getEntityValues('t1', 'EMPLOYEE', 'e1');
    expect(vals).toEqual({ age: 42, vip: true, tags: ['a', 'b'], color: 'blue' });
  });

  it('bulkSetValues upserts and silently skips foreign definitions', async () => {
    defRepo.findOne
      .mockResolvedValueOnce({ id: 'd1' })   // valid definition
      .mockResolvedValueOnce(null);          // foreign/unknown definition
    valRepo.findOne.mockResolvedValue({ id: 'v1', value: 'old' });
    await service.bulkSetValues('t1', 'EMPLOYEE', 'e1', {
      values: [
        { fieldDefinitionId: 'd1', value: 42 },
        { fieldDefinitionId: 'foreign', value: 'x' },
      ],
    } as any);
    expect(valRepo.save).toHaveBeenCalledTimes(1);
    expect(valRepo.save).toHaveBeenCalledWith(expect.objectContaining({ value: '42' }));
  });

  it('deleteDefinition cascades stored values', async () => {
    defRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1' });
    await service.deleteDefinition('t1', 'd1');
    expect(valRepo.delete).toHaveBeenCalledWith({ fieldDefinitionId: 'd1' });
    expect(defRepo.remove).toHaveBeenCalled();
  });
});
