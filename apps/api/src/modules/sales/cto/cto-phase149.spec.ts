import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CtoService } from './cto.service';
import { CtoOptionMapping, CtoConfiguration, CtoAction, CtoStatus } from './entities/cto.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  remove: jest.fn().mockResolvedValue(undefined),
});

// Base laptop with a swappable CPU and optional extra RAM stick.
const MAPPINGS: Partial<CtoOptionMapping>[] = [
  { optionCode: 'BASE', action: CtoAction.ADD, componentCode: 'CHASSIS', componentName: 'Chassis', quantity: 1, uom: 'EA' },
  { optionCode: 'BASE', action: CtoAction.ADD, componentCode: 'CPU-I5', componentName: 'Intel i5', quantity: 1, uom: 'EA' },
  { optionCode: 'BASE', action: CtoAction.ADD, componentCode: 'RAM-16', componentName: '16GB RAM', quantity: 1, uom: 'EA' },
  { optionCode: 'I7', action: CtoAction.SUBSTITUTE, substituteForCode: 'CPU-I5', componentCode: 'CPU-I7', componentName: 'Intel i7', quantity: 1, uom: 'EA' },
  { optionCode: 'RAM_EXTRA', action: CtoAction.ADD, componentCode: 'RAM-16', componentName: '16GB RAM', quantity: 1, uom: 'EA' },
  { optionCode: 'NO_RAM', action: CtoAction.REMOVE, componentCode: 'RAM-16', componentName: '16GB RAM', quantity: 1, uom: 'EA' },
];

const withTenant = (rows: any[]) => rows.map((r) => ({ tenantId: 't1', modelCode: 'LAPTOP', ...r }));

describe('CtoService — Phase 149 (Configure-to-Order)', () => {
  let service: CtoService;
  let mapRepo: any, cfgRepo: any;

  beforeEach(async () => {
    mapRepo = mockRepo();
    cfgRepo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CtoService,
        { provide: getRepositoryToken(CtoOptionMapping), useValue: mapRepo },
        { provide: getRepositoryToken(CtoConfiguration), useValue: cfgRepo },
      ],
    }).compile();
    service = moduleRef.get(CtoService);
  });

  it('explode — base only yields the base BOM', async () => {
    mapRepo.find.mockResolvedValue(withTenant(MAPPINGS));
    const bom = await service.explode('t1', 'LAPTOP', []);
    expect(bom.map((c) => c.componentCode).sort()).toEqual(['CHASSIS', 'CPU-I5', 'RAM-16']);
    expect(bom.every((c) => c.source === 'BASE')).toBe(true);
  });

  it('explode — SUBSTITUTE swaps the base component', async () => {
    mapRepo.find.mockResolvedValue(withTenant(MAPPINGS));
    const bom = await service.explode('t1', 'LAPTOP', ['I7']);
    const codes = bom.map((c) => c.componentCode);
    expect(codes).toContain('CPU-I7');
    expect(codes).not.toContain('CPU-I5');
    expect(bom.find((c) => c.componentCode === 'CPU-I7')?.source).toBe('I7');
  });

  it('explode — ADD of an existing component accumulates quantity', async () => {
    mapRepo.find.mockResolvedValue(withTenant(MAPPINGS));
    const bom = await service.explode('t1', 'LAPTOP', ['RAM_EXTRA']);
    expect(bom.find((c) => c.componentCode === 'RAM-16')?.quantity).toBe(2);
  });

  it('explode — REMOVE drops a base component', async () => {
    mapRepo.find.mockResolvedValue(withTenant(MAPPINGS));
    const bom = await service.explode('t1', 'LAPTOP', ['NO_RAM']);
    expect(bom.map((c) => c.componentCode)).not.toContain('RAM-16');
  });

  it('explode — throws when no mappings exist for the model', async () => {
    mapRepo.find.mockResolvedValue([]);
    await expect(service.explode('t1', 'UNKNOWN', [])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createConfiguration — persists exploded variant BOM and derived item code', async () => {
    mapRepo.find.mockResolvedValue(withTenant(MAPPINGS));
    cfgRepo.count.mockResolvedValue(0);
    const cfg = await service.createConfiguration('t1', { modelCode: 'LAPTOP', selectedOptions: ['I7'], unitPrice: 1300 });
    expect(cfg.configNumber).toBe('CTO-000001');
    expect(cfg.variantItemCode).toBe('LAPTOP-I7');
    expect(cfg.variantBom.map((c) => c.componentCode)).toContain('CPU-I7');
    expect(cfg.status).toBe(CtoStatus.CONFIGURED);
  });

  it('createMapping — SUBSTITUTE requires substituteForCode', async () => {
    await expect(
      service.createMapping('t1', { modelCode: 'M', optionCode: 'O', action: CtoAction.SUBSTITUTE, componentCode: 'C' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('release — stamps a work order number and flips status', async () => {
    const cfg = { id: 'c1', tenantId: 't1', status: CtoStatus.CONFIGURED, variantBom: [{ componentCode: 'X', componentName: 'X', quantity: 1, uom: 'EA', source: 'BASE' }] };
    cfgRepo.findOne.mockResolvedValue(cfg);
    cfgRepo.count.mockResolvedValue(0);
    const released = await service.release('t1', 'c1');
    expect(released.status).toBe(CtoStatus.RELEASED);
    expect(released.workOrderNumber).toBe('CTO-WO-000001');
  });

  it('release — refuses an empty variant BOM', async () => {
    cfgRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CtoStatus.CONFIGURED, variantBom: [] });
    await expect(service.release('t1', 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancel — cannot cancel a released configuration', async () => {
    cfgRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CtoStatus.RELEASED, variantBom: [] });
    await expect(service.cancel('t1', 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
