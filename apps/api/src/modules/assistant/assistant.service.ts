import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationTurn } from './entities/conversation-turn.entity';

export interface IntentDef {
  intent: string;
  keywords: string[];   // any-match keywords
  phrases?: string[];   // stronger multi-word signals
}

/**
 * Ph-265 — ERP intent registry (NLU keyword model). Each intent scores by the
 * number of matched keywords/phrases in the utterance.
 */
const INTENTS: IntentDef[] = [
  { intent: 'PENDING_APPROVALS', keywords: ['approval', 'approvals', 'approve', 'pending', 'awaiting'], phrases: ['pending approvals', 'to approve', 'waiting for me'] },
  { intent: 'LEAVE_BALANCE', keywords: ['leave', 'vacation', 'pto', 'holiday', 'balance', 'time off'], phrases: ['leave balance', 'how much leave', 'days off'] },
  { intent: 'PAYSLIP', keywords: ['payslip', 'payslips', 'salary', 'pay', 'paystub', 'download'], phrases: ['my payslip', 'download payslip', 'salary slip'] },
  { intent: 'OVERDUE_AR', keywords: ['overdue', 'receivable', 'receivables', 'unpaid', 'invoices', 'ar'], phrases: ['overdue invoices', 'who owes', 'unpaid invoices'] },
  { intent: 'CASH_POSITION', keywords: ['cash', 'balance', 'bank', 'liquidity', 'position'], phrases: ['cash position', 'how much cash', 'bank balance'] },
  { intent: 'EXPENSE_STATUS', keywords: ['expense', 'expenses', 'claim', 'reimbursement', 'reimburse'], phrases: ['expense claim', 'my expenses', 'claim status'] },
  { intent: 'GREETING', keywords: ['hi', 'hello', 'hey', 'help', 'thanks'], phrases: ['good morning', 'what can you do'] },
];

@Injectable()
export class AssistantService {
  constructor(
    @InjectRepository(ConversationTurn) private readonly turnRepo: Repository<ConversationTurn>,
  ) {}

  // ─── Ph-265: intent classification ────────────────────────────────

  classify(utterance: string): { intent: string; confidence: number; scores: Record<string, number> } {
    const text = ` ${(utterance ?? '').toLowerCase()} `;
    const scores: Record<string, number> = {};
    let best = 'UNKNOWN';
    let bestScore = 0;
    for (const def of INTENTS) {
      let score = 0;
      for (const k of def.keywords) if (text.includes(` ${k} `) || text.includes(`${k} `) || text.includes(` ${k}`)) score += 1;
      for (const p of def.phrases ?? []) if (text.includes(p)) score += 2;
      scores[def.intent] = score;
      if (score > bestScore) { bestScore = score; best = def.intent; }
    }
    // Confidence: matched signal relative to a small saturation point.
    const confidence = bestScore === 0 ? 0 : Math.min(1, bestScore / 3);
    return { intent: bestScore === 0 ? 'UNKNOWN' : best, confidence: Math.round(confidence * 100) / 100, scores };
  }

  // ─── Ph-266/267/268: intent handlers ──────────────────────────────

  /**
   * Classify + respond. Context supplies the live figures the bot narrates
   * (pending approvals, leave balance, overdue AR, cash, expense status).
   */
  async handle(tenantId: string, userId: string, utterance: string, context: any = {}): Promise<any> {
    const { intent, confidence } = this.classify(utterance);
    let response: string;
    let action: any = null;
    switch (intent) {
      case 'PENDING_APPROVALS': {
        const n = Number(context.pendingApprovals ?? 0);
        response = n > 0 ? `You have ${n} pending approval${n === 1 ? '' : 's'}. Would you like to approve all?` : 'You have no pending approvals. 🎉';
        action = n > 0 ? { type: 'APPROVE_ALL', count: n } : null;
        break;
      }
      case 'LEAVE_BALANCE': {
        const b = context.leaveBalance;
        response = b != null ? `Your leave balance is ${b} day${Number(b) === 1 ? '' : 's'}.` : 'I could not find your leave balance.';
        break;
      }
      case 'PAYSLIP':
        response = context.latestPayslipPeriod ? `Your latest payslip is for ${context.latestPayslipPeriod}. Here is the download link.` : 'No payslip is available yet.';
        action = context.latestPayslipPeriod ? { type: 'DOWNLOAD_PAYSLIP', period: context.latestPayslipPeriod } : null;
        break;
      case 'OVERDUE_AR': {
        const amt = context.overdueArAmount, cnt = context.overdueArCount;
        response = amt != null ? `There ${cnt === 1 ? 'is' : 'are'} ${cnt ?? 0} overdue invoice${cnt === 1 ? '' : 's'} totalling ${amt}.` : 'No overdue receivables found.';
        break;
      }
      case 'CASH_POSITION':
        response = context.cashPosition != null ? `Your current cash position is ${context.cashPosition}.` : 'Cash position is unavailable.';
        break;
      case 'EXPENSE_STATUS':
        response = context.expenseStatus ? `Your latest expense claim is ${context.expenseStatus}.` : 'You have no recent expense claims.';
        break;
      case 'GREETING':
        response = 'Hi! I can help with approvals, leave balance, payslips, overdue invoices, cash position, and expense claims. What do you need?';
        break;
      default:
        response = "Sorry, I didn't understand that. Try asking about approvals, leave, payslips, overdue invoices, or cash position.";
    }
    await this.turnRepo.save(this.turnRepo.create({ tenantId, userId, utterance, intent, confidence, response } as any));
    return { intent, confidence, response, action };
  }

  history(tenantId: string, userId: string, limit = 50): Promise<ConversationTurn[]> {
    return this.turnRepo.find({ where: { tenantId, userId }, order: { createdAt: 'DESC' }, take: limit });
  }
}
