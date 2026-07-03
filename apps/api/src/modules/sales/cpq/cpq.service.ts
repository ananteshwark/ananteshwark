import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { CpqProductModel } from './entities/cpq-product-model.entity';
import { CpqQuote, CpqQuoteStatus } from './entities/cpq-quote.entity';
import { CpqGuidedQuestionnaire } from './entities/cpq-guided-questionnaire.entity';
import { SalesOrder, SalesOrderStatus } from '../entities/sales-order.entity';
import { SalesOrderLine } from '../entities/sales-order-line.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Total discount above this % forces deal-desk approval. */
const APPROVAL_THRESHOLD_PCT = 30;

@Injectable()
export class CpqService {
  constructor(
    @InjectRepository(CpqProductModel) private readonly modelRepo: Repository<CpqProductModel>,
    @InjectRepository(CpqQuote) private readonly quoteRepo: Repository<CpqQuote>,
    @InjectRepository(CpqGuidedQuestionnaire) private readonly guidedRepo: Repository<CpqGuidedQuestionnaire>,
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly soLineRepo: Repository<SalesOrderLine>,
    private readonly sequence: SequenceService,
  ) {}

  // ─── Ph-220: product configurator ─────────────────────────────────

  listModels(tenantId: string): Promise<CpqProductModel[]> {
    return this.modelRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createModel(tenantId: string, data: Partial<CpqProductModel>): Promise<CpqProductModel> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    const dup = await this.modelRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Model code already exists');
    const m = this.modelRepo.create({
      tenantId, code: data.code, name: data.name, basePrice: data.basePrice ?? 0,
      optionGroups: data.optionGroups ?? [], constraints: data.constraints ?? [],
      currency: data.currency ?? 'INR', isActive: true,
    } as any) as unknown as CpqProductModel;
    return (this.modelRepo.save(m) as unknown) as Promise<CpqProductModel>;
  }

  /**
   * Validate a selection against a model's group rules and constraints, and
   * compute the configured price (base + selected option deltas).
   */
  async validateConfiguration(tenantId: string, modelCode: string, selected: string[]): Promise<any> {
    const model = await this.modelRepo.findOne({ where: { tenantId, code: modelCode } });
    if (!model) throw new NotFoundException(`Model ${modelCode} not found`);
    const selectedSet = new Set(selected ?? []);
    const violations: string[] = [];
    const validOptionCodes = new Set<string>();

    for (const group of model.optionGroups ?? []) {
      const codes = group.options.map((o) => o.code);
      codes.forEach((c) => validOptionCodes.add(c));
      const picked = codes.filter((c) => selectedSet.has(c));
      if (group.required && picked.length === 0) violations.push(`Group "${group.name}" requires a selection`);
      if (picked.length < group.minSelect && (group.required || picked.length > 0)) violations.push(`Group "${group.name}" needs at least ${group.minSelect} selection(s)`);
      if (group.maxSelect != null && picked.length > group.maxSelect) violations.push(`Group "${group.name}" allows at most ${group.maxSelect} selection(s)`);
    }
    for (const code of selectedSet) if (!validOptionCodes.has(code)) violations.push(`Unknown option "${code}"`);

    for (const c of model.constraints ?? []) {
      if (selectedSet.has(c.if)) {
        if (c.type === 'REQUIRES' && !selectedSet.has(c.then)) violations.push(`"${c.if}" requires "${c.then}"`);
        if (c.type === 'EXCLUDES' && selectedSet.has(c.then)) violations.push(`"${c.if}" excludes "${c.then}"`);
      }
    }

    let price = Number(model.basePrice);
    for (const group of model.optionGroups ?? []) {
      for (const opt of group.options) if (selectedSet.has(opt.code)) price = round2(price + Number(opt.priceDelta));
    }
    return { modelCode, valid: violations.length === 0, violations, configuredPrice: round2(price), currency: model.currency };
  }

  // ─── Ph-221: pricing waterfall + quote ────────────────────────────

  /**
   * Create a priced quote: validates the config, then applies the waterfall
   * list → customer discount → volume discount → promo → net. Flags approval
   * when the cumulative discount exceeds the threshold.
   */
  async createQuote(tenantId: string, data: {
    modelCode: string; selectedOptions?: string[]; quantity?: number; customerId?: string; customerName?: string;
    customerDiscountPct?: number; volumeDiscountPct?: number; promoDiscountPct?: number;
  }): Promise<CpqQuote> {
    const config = await this.validateConfiguration(tenantId, data.modelCode, data.selectedOptions ?? []);
    if (!config.valid) throw new BadRequestException(`Invalid configuration: ${config.violations.join('; ')}`);
    const qty = data.quantity ?? 1;
    if (qty < 1) throw new BadRequestException('quantity must be >= 1');
    const list = Number(config.configuredPrice);
    const cd = Number(data.customerDiscountPct ?? 0);
    const vd = Number(data.volumeDiscountPct ?? 0);
    const pd = Number(data.promoDiscountPct ?? 0);
    for (const d of [cd, vd, pd]) if (d < 0 || d > 100) throw new BadRequestException('discount % must be between 0 and 100');

    // Sequential waterfall (each applies to the running net).
    const afterCustomer = list * (1 - cd / 100);
    const afterVolume = afterCustomer * (1 - vd / 100);
    const net = round2(afterVolume * (1 - pd / 100));
    const totalDiscountPct = list > 0 ? round2((1 - net / list) * 100) : 0;
    const requiresApproval = totalDiscountPct > APPROVAL_THRESHOLD_PCT;

    const quoteNumber = await this.sequence.formatted(tenantId, 'cpq-quote', 'CPQ-', 5);
    const q = this.quoteRepo.create({
      tenantId, quoteNumber, customerId: data.customerId ?? null, customerName: data.customerName ?? null,
      modelCode: data.modelCode, selectedOptions: data.selectedOptions ?? [], quantity: qty,
      listPrice: round2(list), customerDiscountPct: cd, volumeDiscountPct: vd, promoDiscountPct: pd,
      netUnitPrice: net, netTotal: round2(net * qty), totalDiscountPct,
      requiresApproval, status: CpqQuoteStatus.PRICED, currency: config.currency, soId: null,
    } as any) as unknown as CpqQuote;
    return (this.quoteRepo.save(q) as unknown) as Promise<CpqQuote>;
  }

  listQuotes(tenantId: string): Promise<CpqQuote[]> {
    return this.quoteRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async submitForApproval(tenantId: string, id: string): Promise<CpqQuote> {
    const q = await this.getQuote(tenantId, id);
    if (q.status !== CpqQuoteStatus.PRICED) throw new BadRequestException('Only PRICED quotes can be submitted');
    q.status = q.requiresApproval ? CpqQuoteStatus.APPROVAL_PENDING : CpqQuoteStatus.APPROVED;
    return (this.quoteRepo.save(q) as unknown) as Promise<CpqQuote>;
  }

  async decide(tenantId: string, id: string, decision: 'APPROVE' | 'REJECT'): Promise<CpqQuote> {
    const q = await this.getQuote(tenantId, id);
    if (q.status !== CpqQuoteStatus.APPROVAL_PENDING) throw new BadRequestException('Quote is not pending approval');
    q.status = decision === 'APPROVE' ? CpqQuoteStatus.APPROVED : CpqQuoteStatus.REJECTED;
    return (this.quoteRepo.save(q) as unknown) as Promise<CpqQuote>;
  }

  // ─── Ph-222: guided selling ───────────────────────────────────────

  async createQuestionnaire(tenantId: string, data: Partial<CpqGuidedQuestionnaire>): Promise<CpqGuidedQuestionnaire> {
    if (!data.code?.trim() || !data.questions?.length) throw new BadRequestException('code and questions are required');
    const dup = await this.guidedRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Questionnaire code already exists');
    const g = this.guidedRepo.create({ tenantId, code: data.code, name: data.name ?? data.code, questions: data.questions, isActive: true } as any) as unknown as CpqGuidedQuestionnaire;
    return (this.guidedRepo.save(g) as unknown) as Promise<CpqGuidedQuestionnaire>;
  }

  /** Recommend models from weighted guided-selling answers, ranked by score. */
  async recommend(tenantId: string, code: string, answers: Array<{ questionId: string; value: string }>): Promise<any> {
    const g = await this.guidedRepo.findOne({ where: { tenantId, code } });
    if (!g) throw new NotFoundException('Questionnaire not found');
    const answerMap = new Map((answers ?? []).map((a) => [a.questionId, a.value]));
    const scores = new Map<string, number>();
    for (const q of g.questions ?? []) {
      const chosen = answerMap.get(q.id);
      if (chosen == null) continue;
      for (const a of q.answers) {
        if (a.value === chosen) scores.set(a.modelCode, round2((scores.get(a.modelCode) ?? 0) + Number(a.weight)));
      }
    }
    const ranked = [...scores.entries()].map(([modelCode, score]) => ({ modelCode, score })).sort((a, b) => b.score - a.score);
    return { questionnaire: code, ranked, recommended: ranked[0]?.modelCode ?? null };
  }

  // ─── Ph-223: quote document (PDF source) ──────────────────────────

  /** Branded quote document payload (rendered to PDF by the client/print). */
  async quoteDocument(tenantId: string, id: string): Promise<any> {
    const q = await this.getQuote(tenantId, id);
    const model = await this.modelRepo.findOne({ where: { tenantId, code: q.modelCode } });
    const optionLines: any[] = [];
    if (model) {
      for (const group of model.optionGroups ?? []) {
        for (const opt of group.options) {
          if ((q.selectedOptions ?? []).includes(opt.code)) optionLines.push({ group: group.name, option: opt.name, priceDelta: Number(opt.priceDelta) });
        }
      }
    }
    return {
      document: 'QUOTE',
      quoteNumber: q.quoteNumber,
      status: q.status,
      customer: { id: q.customerId, name: q.customerName },
      model: { code: q.modelCode, name: model?.name ?? q.modelCode, basePrice: model ? Number(model.basePrice) : null },
      options: optionLines,
      pricing: {
        listPrice: Number(q.listPrice), customerDiscountPct: Number(q.customerDiscountPct),
        volumeDiscountPct: Number(q.volumeDiscountPct), promoDiscountPct: Number(q.promoDiscountPct),
        netUnitPrice: Number(q.netUnitPrice), quantity: q.quantity, netTotal: Number(q.netTotal),
        totalDiscountPct: Number(q.totalDiscountPct), currency: q.currency,
      },
      termsAndConditions: [
        'Prices valid for 30 days from quote date.',
        'Taxes extra as applicable.',
        'Delivery subject to stock availability.',
      ],
    };
  }

  // ─── Ph-224: quote-to-order ───────────────────────────────────────

  /** Convert an APPROVED quote into a sales order carrying the configuration. */
  async convertToOrder(tenantId: string, id: string): Promise<any> {
    const q = await this.getQuote(tenantId, id);
    if (q.status !== CpqQuoteStatus.APPROVED) throw new BadRequestException('Only APPROVED quotes can be converted');
    if (q.soId) throw new BadRequestException('Quote already converted');
    const model = await this.modelRepo.findOne({ where: { tenantId, code: q.modelCode } });
    const orderNumber = await this.sequence.formatted(tenantId, 'cpq-sales-order', 'SO-CPQ-', 5);
    const order = this.soRepo.create({
      tenantId, orderNumber, quoteId: q.id, customerId: q.customerId, contactName: q.customerName,
      orderDate: new Date().toISOString().slice(0, 10), status: SalesOrderStatus.DRAFT,
      subtotal: Number(q.netTotal), discountAmount: round2((Number(q.listPrice) - Number(q.netUnitPrice)) * q.quantity),
      taxAmount: 0, total: Number(q.netTotal), currency: q.currency,
    } as any) as unknown as SalesOrder;
    const savedOrder = (await this.soRepo.save(order)) as unknown as SalesOrder;
    const line = this.soLineRepo.create({
      tenantId, orderId: savedOrder.id, lineNumber: 1, itemCode: q.modelCode,
      itemName: model?.name ?? q.modelCode, description: `CPQ config: ${(q.selectedOptions ?? []).join(', ') || 'base'}`,
      quantity: q.quantity, unitPrice: Number(q.netUnitPrice), discountPct: 0, taxPct: 0,
      lineTotal: Number(q.netTotal),
    } as any) as unknown as SalesOrderLine;
    await this.soLineRepo.save(line);
    q.status = CpqQuoteStatus.ORDERED;
    q.soId = savedOrder.id;
    await this.quoteRepo.save(q);
    return { quoteId: q.id, orderId: savedOrder.id, orderNumber, total: Number(q.netTotal) };
  }

  private async getQuote(tenantId: string, id: string): Promise<CpqQuote> {
    const q = await this.quoteRepo.findOne({ where: { id, tenantId } });
    if (!q) throw new NotFoundException(`Quote ${id} not found`);
    return q;
  }
}
