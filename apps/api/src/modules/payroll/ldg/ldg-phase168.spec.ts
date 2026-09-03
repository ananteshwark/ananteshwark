import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LdgService } from './ldg.service';
import { LegislativeDataGroup, RoundingRule } from './entities/legislative-data-group.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('LdgService — Phase 168', () => {
  let service: LdgService;
  let repo: any;

  beforeEach(async () => {
    repo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        LdgService,
        { provide: getRepositoryToken(LegislativeDataGroup), useValue: repo },
      ],
    }).compile();
    service = module.get(LdgService);
  });

  it('create — rejects duplicate code', async () => {
    repo.findOne.mockResolvedValue({ id: 'x' });
    await expect(service.create('t1', { code: 'IN_LDG', countryCode: 'IN' })).rejects.toThrow(BadRequestException);
  });

  it('create — requires code + countryCode', async () => {
    await expect(service.create('t1', { code: 'X' } as any)).rejects.toThrow(BadRequestException);
  });

  it('get — throws when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.get('t1', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('resolveForCountry — queries active by country', async () => {
    repo.findOne.mockResolvedValue({ id: 'l1', countryCode: 'IN' });
    const r = await service.resolveForCountry('t1', 'IN');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', countryCode: 'IN', isActive: true } });
    expect(r?.id).toBe('l1');
  });

  // ─── rounding ─────────────────────────────────────────────────────

  it('applyRounding — NEAREST at precision 0', () => {
    const ldg = { roundingRule: RoundingRule.NEAREST, roundingPrecision: 0 } as LegislativeDataGroup;
    expect(service.applyRounding(ldg, 100.6)).toBe(101);
    expect(service.applyRounding(ldg, 100.4)).toBe(100);
  });

  it('applyRounding — DOWN at precision 2', () => {
    const ldg = { roundingRule: RoundingRule.DOWN, roundingPrecision: 2 } as LegislativeDataGroup;
    expect(service.applyRounding(ldg, 100.999)).toBe(100.99);
  });

  it('applyRounding — UP at precision 0', () => {
    const ldg = { roundingRule: RoundingRule.UP, roundingPrecision: 0 } as LegislativeDataGroup;
    expect(service.applyRounding(ldg, 100.01)).toBe(101);
  });

  // ─── seed ─────────────────────────────────────────────────────────

  it('seedDefaults — creates IN/UK/US when absent', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.seedDefaults('t1');
    expect(r.created).toBe(3);
    const codes = repo.create.mock.calls.map((c: any) => c[0].code);
    expect(codes).toEqual(expect.arrayContaining(['IN_LDG', 'UK_LDG', 'US_LDG']));
  });

  it('seedDefaults — skips existing', async () => {
    repo.findOne.mockResolvedValue({ id: 'exists' });
    const r = await service.seedDefaults('t1');
    expect(r.created).toBe(0);
  });
});
