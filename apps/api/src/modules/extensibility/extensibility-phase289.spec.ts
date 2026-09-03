import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ExtensibilityService } from './extensibility.service';
import { CustomObject } from './entities/custom-object.entity';
import { CustomRecord } from './entities/custom-record.entity';
import { ValidationRule } from './entities/validation-rule.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ExtensibilityService — Phase 289-292', () => {
  let service: ExtensibilityService;
  let objectRepo: any, recordRepo: any, ruleRepo: any;

  beforeEach(async () => {
    objectRepo = mockRepo(); recordRepo = mockRepo(); ruleRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ExtensibilityService,
        { provide: getRepositoryToken(CustomObject), useValue: objectRepo },
        { provide: getRepositoryToken(CustomRecord), useValue: recordRepo },
        { provide: getRepositoryToken(ValidationRule), useValue: ruleRepo },
      ],
    }).compile();
    service = module.get(ExtensibilityService);
  });

  const OBJ = { id: 'o1', apiName: 'asset', fields: [{ name: 'code', type: 'string', required: true }, { name: 'value', type: 'number' }] };

  // ─── Ph-289: objects ──────────────────────────────────────────────

  it('createObject — rejects an invalid field type', async () => {
    objectRepo.findOne.mockResolvedValue(null);
    await expect(service.createObject('t1', { name: 'X', apiName: 'x', fields: [{ name: 'f', label: 'F', type: 'blob' as any }] })).rejects.toThrow(BadRequestException);
  });

  it('createObject — defaults list view + sidebar label from fields/name', async () => {
    objectRepo.findOne.mockResolvedValue(null);
    objectRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const o = await service.createObject('t1', { name: 'Asset', apiName: 'asset', fields: [{ name: 'code', label: 'Code', type: 'string' }] });
    expect(o.sidebarLabel).toBe('Asset');
    expect(o.listViewColumns).toEqual(['code']);
  });

  // ─── Ph-289/291: records + validation ─────────────────────────────

  it('createRecord — enforces required fields', async () => {
    objectRepo.findOne.mockResolvedValue(OBJ);
    ruleRepo.find.mockResolvedValue([]);
    await expect(service.createRecord('t1', 'o1', { value: 5 })).rejects.toThrow(/required/);
  });

  it('createRecord — enforces field types', async () => {
    objectRepo.findOne.mockResolvedValue(OBJ);
    ruleRepo.find.mockResolvedValue([]);
    await expect(service.createRecord('t1', 'o1', { code: 'A1', value: 'not-a-number' })).rejects.toThrow(/must be a number/);
  });

  it('createRecord — fires a tenant validation rule', async () => {
    objectRepo.findOne.mockResolvedValue(OBJ);
    ruleRepo.find.mockResolvedValue([{ condition: { field: 'value', op: 'lt', value: 0 }, errorMessage: 'value must be >= 0', isActive: true }]);
    await expect(service.createRecord('t1', 'o1', { code: 'A1', value: -5 })).rejects.toThrow('value must be >= 0');
  });

  it('createRecord — succeeds on a valid record', async () => {
    objectRepo.findOne.mockResolvedValue(OBJ);
    ruleRepo.find.mockResolvedValue([{ condition: { field: 'value', op: 'lt', value: 0 }, errorMessage: 'bad', isActive: true }]);
    recordRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.createRecord('t1', 'o1', { code: 'A1', value: 10 });
    expect(r.data.code).toBe('A1');
  });

  // ─── Ph-292: marketplace ──────────────────────────────────────────

  it('marketplaceCatalog — lists the vertical packs', () => {
    const keys = service.marketplaceCatalog().map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['RETAIL', 'CONSTRUCTION', 'HEALTHCARE', 'NONPROFIT']));
  });

  it('installPack — creates the pack objects, skipping existing', async () => {
    objectRepo.findOne
      .mockResolvedValueOnce(null)                 // store: not present → create
      .mockResolvedValueOnce(null)                 // createObject dup check for store
      .mockResolvedValueOnce({ id: 'x' });         // planogram: already present → skip
    objectRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.installPack('t1', 'RETAIL');
    expect(r.created).toContain('store');
    expect(r.skipped).toContain('planogram');
  });

  it('installPack — rejects an unknown pack', async () => {
    await expect(service.installPack('t1', 'NOPE')).rejects.toThrow(BadRequestException);
  });
});
