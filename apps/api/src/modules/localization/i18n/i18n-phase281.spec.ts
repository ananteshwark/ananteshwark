import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { I18nService } from './i18n.service';
import { I18nLocale } from './entities/locale.entity';
import { I18nTranslation } from './entities/translation.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('I18nService — Phase 281-284', () => {
  let service: I18nService;
  let localeRepo: any, translationRepo: any;

  beforeEach(async () => {
    localeRepo = mockRepo(); translationRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        I18nService,
        { provide: getRepositoryToken(I18nLocale), useValue: localeRepo },
        { provide: getRepositoryToken(I18nTranslation), useValue: translationRepo },
      ],
    }).compile();
    service = module.get(I18nService);
  });

  // ─── Ph-281/283: locales + RTL ────────────────────────────────────

  it('seedLocales — includes RTL locales (ar/he)', async () => {
    localeRepo.count.mockResolvedValue(0);
    localeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.seedLocales('t1');
    const ar = r.find((l) => l.code === 'ar');
    expect(ar?.rtl).toBe(true);
    expect(r.find((l) => l.code === 'en')?.rtl).toBe(false);
  });

  it('seedLocales — refuses when already seeded', async () => {
    localeRepo.count.mockResolvedValue(5);
    await expect(service.seedLocales('t1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-282: translate + interpolation + fallback ─────────────────

  it('translate — interpolates variables', async () => {
    translationRepo.findOne.mockResolvedValue({ value: 'Hello {{name}}, invoice {{no}}' });
    const r = await service.translate('t1', 'hi', 'invoice', 'greeting', { name: 'Asha', no: 'INV-1' });
    expect(r.text).toBe('Hello Asha, invoice INV-1');
    expect(r.fallback).toBe(false);
  });

  it('translate — falls back to English when locale missing', async () => {
    translationRepo.findOne
      .mockResolvedValueOnce(null)                       // hi miss
      .mockResolvedValueOnce({ value: 'English text' }); // en hit
    const r = await service.translate('t1', 'hi', 'ui', 'welcome');
    expect(r.text).toBe('English text');
    expect(r.fallback).toBe(true);
    expect(r.locale).toBe('en');
  });

  it('translate — returns the raw key when nothing found', async () => {
    translationRepo.findOne.mockResolvedValue(null);
    const r = await service.translate('t1', 'en', 'ui', 'missing.key');
    expect(r.text).toBe('missing.key');
  });

  it('bundle — builds a key→value map', async () => {
    translationRepo.find.mockResolvedValue([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]);
    const r = await service.bundle('t1', 'en', 'ui');
    expect(r).toEqual({ a: '1', b: '2' });
  });

  // ─── Ph-284: formatting ───────────────────────────────────────────

  it('format — currency uses locale + currency code', () => {
    const r = service.format('en-US', 'currency', 1234.5, { currency: 'USD' });
    expect(r.formatted).toContain('$');
    expect(r.formatted).toContain('1,234.5');
  });

  it('format — number groups per locale', () => {
    const r = service.format('en-US', 'number', 1000000);
    expect(r.formatted).toBe('1,000,000');
  });

  it('format — rejects an invalid locale', () => {
    expect(() => service.format('not a locale!!', 'number', 1)).toThrow(BadRequestException);
  });
});
