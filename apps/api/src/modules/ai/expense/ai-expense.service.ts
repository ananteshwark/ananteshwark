import { Injectable, Logger, Optional, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { OcrUsage } from './entities/ocr-usage.entity';

export const AI_EXPENSE_LLM_CLIENT = 'AI_EXPENSE_LLM_CLIENT';

const DEFAULT_OCR_MONTHLY_QUOTA = Number(process.env.AI_OCR_MONTHLY_QUOTA ?? 500);

export interface ExpenseLineInput {
  id?: string;
  merchant?: string;
  category?: string;
  amount: number;
  date: string;          // YYYY-MM-DD
  hasReceipt?: boolean;
}

export interface RiskPolicy {
  highAmountThreshold?: number;            // flag lines above this
  categoryCaps?: Record<string, number>;  // per-category amount cap
  allowedCategories?: string[];            // whitelist; others are out-of-policy
  receiptRequiredOver?: number;            // receipt mandatory above this amount
}

export interface LineRisk {
  lineId?: string;
  riskScore: number; // 0–100
  flags: Array<{ code: string; detail: string; weight: number }>;
}

// Detector weights (contribution to the 0–100 risk score).
const WEIGHTS = {
  HIGH_AMOUNT: 25,
  ROUND_AMOUNT: 10,
  WEEKEND: 10,
  OUT_OF_POLICY_CATEGORY: 25,
  OVER_CAP: 30,
  DUPLICATE: 30,
  MISSING_RECEIPT: 20,
};

/**
 * AI expense layer: metered receipt OCR (LLM-backed, gated on
 * ANTHROPIC_API_KEY) plus deterministic, productized line risk scoring.
 */
@Injectable()
export class AiExpenseService {
  private readonly logger = new Logger(AiExpenseService.name);
  private readonly client: Anthropic | null;

  constructor(
    @InjectRepository(OcrUsage) private readonly usageRepo: Repository<OcrUsage>,
    @Optional() @Inject(AI_EXPENSE_LLM_CLIENT) client?: Anthropic,
  ) {
    this.client = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get ocrEnabled(): boolean {
    return !!this.client;
  }

  // ─── Metered receipt OCR ──────────────────────────────────────

  async ocrUsage(tenantId: string, month: string): Promise<{ month: string; count: number; quota: number; remaining: number }> {
    const row = await this.usageRepo.findOne({ where: { tenantId, month } });
    const count = row?.count ?? 0;
    return { month, count, quota: DEFAULT_OCR_MONTHLY_QUOTA, remaining: Math.max(0, DEFAULT_OCR_MONTHLY_QUOTA - count) };
  }

  private async consumeMeter(tenantId: string, month: string): Promise<void> {
    let row = await this.usageRepo.findOne({ where: { tenantId, month } });
    if (!row) row = this.usageRepo.create({ tenantId, month, count: 0 });
    if (row.count >= DEFAULT_OCR_MONTHLY_QUOTA) throw new ForbiddenException(`Monthly OCR quota of ${DEFAULT_OCR_MONTHLY_QUOTA} reached`);
    row.count += 1;
    await this.usageRepo.save(row);
  }

  /**
   * Extract structured fields from a receipt. Consumes one metered unit.
   * Requires the LLM key; without it the caller should fall back to manual
   * entry (available:false is returned rather than throwing).
   */
  async extractReceipt(tenantId: string, month: string, input: { text?: string; imageBase64?: string; mediaType?: string }): Promise<{ available: boolean; reason?: string; fields?: any }> {
    if (!this.client) return { available: false, reason: 'Receipt OCR is not configured (no ANTHROPIC_API_KEY)' };
    if (!input.text?.trim() && !input.imageBase64) throw new BadRequestException('Provide receipt text or an image');
    await this.consumeMeter(tenantId, month);

    const tool: Anthropic.Messages.ToolUnion = {
      name: 'record_receipt',
      description: 'Record the structured fields extracted from a receipt.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          merchant: { type: ['string', 'null'] },
          date: { type: ['string', 'null'], description: 'ISO date YYYY-MM-DD' },
          currency: { type: ['string', 'null'] },
          total: { type: ['number', 'null'] },
          tax: { type: ['number', 'null'] },
          category: { type: ['string', 'null'] },
        },
        required: ['merchant', 'date', 'currency', 'total', 'tax', 'category'],
        additionalProperties: false,
      },
    };
    const content: any[] = [];
    if (input.imageBase64) content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType ?? 'image/jpeg', data: input.imageBase64 } });
    if (input.text?.trim()) content.push({ type: 'text', text: input.text });
    content.push({ type: 'text', text: 'Extract the receipt fields via the record_receipt tool. Use null for anything not present.' });

    try {
      const response = await this.client.messages.create({
        model: process.env.AI_OCR_MODEL ?? 'claude-opus-4-8',
        max_tokens: 512,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'record_receipt' },
        messages: [{ role: 'user', content }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      return { available: true, fields: toolUse?.input ?? null };
    } catch (e: any) {
      this.logger.warn(`receipt OCR failed: ${e?.message ?? e}`);
      return { available: false, reason: 'OCR extraction failed; please enter the receipt manually' };
    }
  }

  // ─── Deterministic line risk scoring ──────────────────────────

  /** Score a single expense line against policy; duplicates need sibling lines. */
  static scoreLine(line: ExpenseLineInput, policy: RiskPolicy, siblings: ExpenseLineInput[] = []): LineRisk {
    const flags: LineRisk['flags'] = [];
    const amount = Number(line.amount);

    if (policy.highAmountThreshold != null && amount > policy.highAmountThreshold) {
      flags.push({ code: 'HIGH_AMOUNT', detail: `Amount ${amount} exceeds ${policy.highAmountThreshold}`, weight: WEIGHTS.HIGH_AMOUNT });
    }
    if (amount >= 100 && amount % 100 === 0) {
      flags.push({ code: 'ROUND_AMOUNT', detail: `Round amount ${amount}`, weight: WEIGHTS.ROUND_AMOUNT });
    }
    if (line.date && AiExpenseService.isWeekend(line.date)) {
      flags.push({ code: 'WEEKEND', detail: `Dated on a weekend (${line.date})`, weight: WEIGHTS.WEEKEND });
    }
    if (line.category && policy.allowedCategories && !policy.allowedCategories.includes(line.category)) {
      flags.push({ code: 'OUT_OF_POLICY_CATEGORY', detail: `Category "${line.category}" is not permitted`, weight: WEIGHTS.OUT_OF_POLICY_CATEGORY });
    }
    const cap = line.category ? policy.categoryCaps?.[line.category] : undefined;
    if (cap != null && amount > cap) {
      flags.push({ code: 'OVER_CAP', detail: `Amount ${amount} over the ${line.category} cap of ${cap}`, weight: WEIGHTS.OVER_CAP });
    }
    if (policy.receiptRequiredOver != null && amount > policy.receiptRequiredOver && line.hasReceipt === false) {
      flags.push({ code: 'MISSING_RECEIPT', detail: `Receipt required over ${policy.receiptRequiredOver}`, weight: WEIGHTS.MISSING_RECEIPT });
    }
    const dup = siblings.find((s) => s !== line && s.id !== line.id && Number(s.amount) === amount && (s.merchant ?? '') === (line.merchant ?? '') && s.date === line.date);
    if (dup) {
      flags.push({ code: 'DUPLICATE', detail: `Possible duplicate of another ${amount} line at "${line.merchant}" on ${line.date}`, weight: WEIGHTS.DUPLICATE });
    }

    const riskScore = Math.min(100, flags.reduce((s, f) => s + f.weight, 0));
    return { lineId: line.id, riskScore, flags };
  }

  static isWeekend(date: string): boolean {
    const d = new Date(`${date}T00:00:00Z`);
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  /** Score all lines of a claim and roll up an overall claim risk. */
  scoreClaim(lines: ExpenseLineInput[], policy: RiskPolicy): { lines: LineRisk[]; claimRisk: number; highRiskCount: number } {
    const scored = (lines ?? []).map((l) => AiExpenseService.scoreLine(l, policy, lines));
    const claimRisk = scored.length ? Math.round(Math.max(...scored.map((s) => s.riskScore), 0)) : 0;
    return { lines: scored, claimRisk, highRiskCount: scored.filter((s) => s.riskScore >= 50).length };
  }
}
