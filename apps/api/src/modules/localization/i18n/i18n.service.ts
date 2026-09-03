import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nLocale } from './entities/locale.entity';
import { I18nTranslation } from './entities/translation.entity';

@Injectable()
export class I18nService {
  constructor(
    @InjectRepository(I18nLocale) private readonly localeRepo: Repository<I18nLocale>,
    @InjectRepository(I18nTranslation) private readonly translationRepo: Repository<I18nTranslation>,
  ) {}

  // ─── Ph-281/283: locales (incl. RTL) ──────────────────────────────

  listLocales(tenantId: string): Promise<I18nLocale[]> {
    return this.localeRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async seedLocales(tenantId: string): Promise<I18nLocale[]> {
    const existing = await this.localeRepo.count({ where: { tenantId } });
    if (existing > 0) throw new BadRequestException('Locales already seeded');
    const defs = [
      { code: 'en', name: 'English', rtl: false, currency: 'USD' },
      { code: 'hi', name: 'हिन्दी', rtl: false, currency: 'INR' },
      { code: 'ar', name: 'العربية', rtl: true, currency: 'AED' },
      { code: 'he', name: 'עברית', rtl: true, currency: 'ILS' },
      { code: 'fr-FR', name: 'Français', rtl: false, currency: 'EUR' },
    ];
    const saved: I18nLocale[] = [];
    for (const d of defs) saved.push((await this.localeRepo.save(this.localeRepo.create({ tenantId, ...d, isActive: true } as any))) as unknown as I18nLocale);
    return saved;
  }

  // ─── Ph-281/282: translations ─────────────────────────────────────

  async upsertTranslation(tenantId: string, data: { locale: string; namespace?: string; key: string; value: string }): Promise<I18nTranslation> {
    if (!data.locale || !data.key) throw new BadRequestException('locale and key are required');
    const namespace = data.namespace ?? 'ui';
    let row = await this.translationRepo.findOne({ where: { tenantId, locale: data.locale, namespace, key: data.key } });
    if (row) row.value = data.value;
    else row = this.translationRepo.create({ tenantId, locale: data.locale, namespace, key: data.key, value: data.value } as any) as unknown as I18nTranslation;
    return (this.translationRepo.save(row) as unknown) as Promise<I18nTranslation>;
  }

  /** A key→value bundle for a locale/namespace (frontend i18n loads this). */
  async bundle(tenantId: string, locale: string, namespace = 'ui'): Promise<Record<string, string>> {
    const rows = await this.translationRepo.find({ where: { tenantId, locale, namespace } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  /**
   * Ph-282 — Render a document/UI string in a target language, falling back to
   * English then the raw key, with {{var}} interpolation.
   */
  async translate(tenantId: string, locale: string, namespace: string, key: string, vars: Record<string, any> = {}): Promise<{ locale: string; text: string; fallback: boolean }> {
    let row = await this.translationRepo.findOne({ where: { tenantId, locale, namespace, key } });
    let fallback = false;
    if (!row && locale !== 'en') { row = await this.translationRepo.findOne({ where: { tenantId, locale: 'en', namespace, key } }); fallback = !!row; }
    let text = row?.value ?? key;
    text = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, v) => (vars[v] != null ? String(vars[v]) : `{{${v}}}`));
    return { locale: fallback ? 'en' : locale, text, fallback };
  }

  // ─── Ph-284: locale-aware formatting ──────────────────────────────

  /** Format a value per a locale (Intl-based number/currency/date). */
  format(locale: string, kind: 'number' | 'currency' | 'date', value: any, opts: { currency?: string } = {}): { formatted: string } {
    try {
      if (kind === 'number') return { formatted: new Intl.NumberFormat(locale).format(Number(value)) };
      if (kind === 'currency') return { formatted: new Intl.NumberFormat(locale, { style: 'currency', currency: opts.currency ?? 'USD' }).format(Number(value)) };
      return { formatted: new Intl.DateTimeFormat(locale).format(new Date(value)) };
    } catch {
      throw new BadRequestException(`Unable to format for locale "${locale}"`);
    }
  }
}
