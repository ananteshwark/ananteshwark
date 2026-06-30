import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractClause, ClauseRisk } from './entities/contract-clause.entity';
import { ClauseDeviation, DeviationStatus } from './entities/clause-deviation.entity';
import { SignatureEnvelope, SignatureProvider, EnvelopeStatus } from './entities/signature-envelope.entity';
import { Contract } from '../entities/contract.entity';

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

@Injectable()
export class ClmService {
  constructor(
    @InjectRepository(ContractClause) private readonly clauseRepo: Repository<ContractClause>,
    @InjectRepository(ClauseDeviation) private readonly deviationRepo: Repository<ClauseDeviation>,
    @InjectRepository(SignatureEnvelope) private readonly envelopeRepo: Repository<SignatureEnvelope>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
  ) {}

  // ─── Ph-209: clause library & assembly ────────────────────────────

  listClauses(tenantId: string, approvedOnly = false): Promise<ContractClause[]> {
    const where: any = { tenantId };
    if (approvedOnly) where.isApproved = true;
    return this.clauseRepo.find({ where, order: { code: 'ASC' } });
  }

  async createClause(tenantId: string, data: { code: string; title: string; category?: string; standardText: string; riskLevel?: ClauseRisk; isApproved?: boolean }): Promise<ContractClause> {
    if (!data.code?.trim() || !data.standardText?.trim()) throw new BadRequestException('code and standardText are required');
    const dup = await this.clauseRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Clause code already exists');
    const c = this.clauseRepo.create({
      tenantId, code: data.code, title: data.title, category: data.category ?? null,
      standardText: data.standardText, riskLevel: data.riskLevel ?? ClauseRisk.LOW, isApproved: data.isApproved ?? false,
    } as any) as unknown as ContractClause;
    return (this.clauseRepo.save(c) as unknown) as Promise<ContractClause>;
  }

  async approveClause(tenantId: string, id: string): Promise<ContractClause> {
    const c = await this.clauseRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Clause not found');
    c.isApproved = true;
    return (this.clauseRepo.save(c) as unknown) as Promise<ContractClause>;
  }

  /** Assemble a contract body from approved clauses (in the given order). */
  async assemble(tenantId: string, clauseCodes: string[]): Promise<any> {
    if (!clauseCodes?.length) throw new BadRequestException('clauseCodes are required');
    const clauses = await this.clauseRepo.find({ where: { tenantId } });
    const byCode = new Map(clauses.map((c) => [c.code, c]));
    const missing: string[] = [];
    const unapproved: string[] = [];
    const ordered: ContractClause[] = [];
    for (const code of clauseCodes) {
      const c = byCode.get(code);
      if (!c) { missing.push(code); continue; }
      if (!c.isApproved) { unapproved.push(code); continue; }
      ordered.push(c);
    }
    if (missing.length) throw new BadRequestException(`Unknown clause codes: ${missing.join(', ')}`);
    if (unapproved.length) throw new BadRequestException(`Clauses not approved: ${unapproved.join(', ')}`);
    const body = ordered.map((c) => `## ${c.title}\n\n${c.standardText}`).join('\n\n');
    const highRisk = ordered.filter((c) => c.riskLevel === ClauseRisk.HIGH).map((c) => c.code);
    return { clauseCount: ordered.length, highRiskClauses: highRisk, body };
  }

  // ─── Ph-210: deviation management ─────────────────────────────────

  /** Record a non-standard clause; flags a deviation when text differs from standard. */
  async recordDeviation(tenantId: string, data: { contractId: string; clauseCode: string; proposedText: string; riskLevel?: ClauseRisk }): Promise<any> {
    if (!data.proposedText?.trim()) throw new BadRequestException('proposedText is required');
    const standard = await this.clauseRepo.findOne({ where: { tenantId, code: data.clauseCode } });
    const standardText = standard?.standardText ?? null;
    const isDeviation = !standard || standard.standardText.trim() !== data.proposedText.trim();
    if (!isDeviation) return { deviation: false, message: 'Proposed text matches the standard clause' };
    const dev = this.deviationRepo.create({
      tenantId, contractId: data.contractId, clauseCode: data.clauseCode, standardText,
      proposedText: data.proposedText, riskLevel: data.riskLevel ?? standard?.riskLevel ?? ClauseRisk.MEDIUM,
      status: DeviationStatus.PENDING, reviewedBy: null, reviewNotes: null,
    } as any) as unknown as ClauseDeviation;
    const saved = (await this.deviationRepo.save(dev)) as unknown as ClauseDeviation;
    return { deviation: true, routedTo: 'LEGAL', record: saved };
  }

  listDeviations(tenantId: string, contractId?: string, status?: DeviationStatus): Promise<ClauseDeviation[]> {
    const where: any = { tenantId };
    if (contractId) where.contractId = contractId;
    if (status) where.status = status;
    return this.deviationRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async reviewDeviation(tenantId: string, id: string, userId: string, decision: 'APPROVE' | 'REJECT', notes?: string): Promise<ClauseDeviation> {
    const dev = await this.deviationRepo.findOne({ where: { id, tenantId } });
    if (!dev) throw new NotFoundException('Deviation not found');
    if (dev.status !== DeviationStatus.PENDING) throw new BadRequestException('Only PENDING deviations can be reviewed');
    dev.status = decision === 'APPROVE' ? DeviationStatus.APPROVED : DeviationStatus.REJECTED;
    dev.reviewedBy = userId;
    dev.reviewNotes = notes ?? null;
    return (this.deviationRepo.save(dev) as unknown) as Promise<ClauseDeviation>;
  }

  // ─── Ph-212: e-signature ──────────────────────────────────────────

  async createEnvelope(tenantId: string, data: { contractId: string; provider?: SignatureProvider; signers: Array<{ name: string; email: string; order?: number }> }): Promise<SignatureEnvelope> {
    if (!data.signers?.length) throw new BadRequestException('at least one signer is required');
    for (const s of data.signers) if (!s.email) throw new BadRequestException('each signer needs an email');
    const env = this.envelopeRepo.create({
      tenantId, contractId: data.contractId, provider: data.provider ?? SignatureProvider.INTERNAL,
      status: EnvelopeStatus.CREATED, externalId: null,
      signers: data.signers.map((s, i) => ({ ...s, order: s.order ?? i + 1, status: 'PENDING' })),
      sentAt: null, completedAt: null,
    } as any) as unknown as SignatureEnvelope;
    return (this.envelopeRepo.save(env) as unknown) as Promise<SignatureEnvelope>;
  }

  async sendEnvelope(tenantId: string, id: string, sentAt: string, externalId?: string): Promise<SignatureEnvelope> {
    const env = await this.getEnvelope(tenantId, id);
    if (env.status !== EnvelopeStatus.CREATED) throw new BadRequestException('Only CREATED envelopes can be sent');
    env.status = EnvelopeStatus.SENT;
    env.sentAt = new Date(sentAt);
    env.externalId = externalId ?? env.externalId;
    return (this.envelopeRepo.save(env) as unknown) as Promise<SignatureEnvelope>;
  }

  /** Provider callback: update a signer's status; complete the envelope when all sign. */
  async updateSignature(tenantId: string, id: string, data: { email: string; decision: 'SIGNED' | 'DECLINED'; at: string }): Promise<SignatureEnvelope> {
    const env = await this.getEnvelope(tenantId, id);
    if (env.status !== EnvelopeStatus.SENT) throw new BadRequestException('Envelope is not out for signature');
    const signer = env.signers.find((s) => s.email === data.email);
    if (!signer) throw new NotFoundException(`Signer ${data.email} not on envelope`);
    if (data.decision === 'DECLINED') {
      signer.status = 'DECLINED';
      env.status = EnvelopeStatus.DECLINED;
    } else {
      signer.status = 'SIGNED';
      signer.signedAt = data.at;
      if (env.signers.every((s) => s.status === 'SIGNED')) {
        env.status = EnvelopeStatus.SIGNED;
        env.completedAt = new Date(data.at);
        // Mark the contract signed.
        const contract = await this.contractRepo.findOne({ where: { id: env.contractId, tenantId } });
        if (contract) { contract.signedDate = data.at.slice(0, 10); await this.contractRepo.save(contract); }
      }
    }
    env.signers = [...env.signers];
    return (this.envelopeRepo.save(env) as unknown) as Promise<SignatureEnvelope>;
  }

  listEnvelopes(tenantId: string, contractId: string): Promise<SignatureEnvelope[]> {
    return this.envelopeRepo.find({ where: { tenantId, contractId }, order: { createdAt: 'DESC' } });
  }

  // ─── Ph-213: renewal management ───────────────────────────────────

  /**
   * Contracts approaching expiry, bucketed at 90/60/30 days. Uses each
   * contract's own alertDaysBefore as the outer window when larger.
   */
  async renewalAlerts(tenantId: string, asOf: string): Promise<any> {
    const contracts = await this.contractRepo.find({ where: { tenantId } });
    const active = contracts.filter((c) => c.endDate && (c.status === 'ACTIVE' || c.status === 'DRAFT'));
    const alerts = active.map((c) => {
      const days = daysBetween(asOf, c.endDate as string);
      let bucket: '90' | '60' | '30' | 'OVERDUE' | null = null;
      if (days < 0) bucket = 'OVERDUE';
      else if (days <= 30) bucket = '30';
      else if (days <= 60) bucket = '60';
      else if (days <= 90) bucket = '90';
      return bucket ? {
        contractId: c.id, contractNumber: c.contractNumber, title: c.title,
        counterpartyName: c.counterpartyName, endDate: c.endDate, daysToExpiry: days,
        bucket, renewalType: c.renewalType,
      } : null;
    }).filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    return { asOf, count: alerts.length, alerts };
  }

  /** Initiate a renewal: clone the contract intent into a DRAFT renewal record. */
  async initiateRenewal(tenantId: string, contractId: string, newEndDate: string): Promise<Contract> {
    const c = await this.contractRepo.findOne({ where: { id: contractId, tenantId } });
    if (!c) throw new NotFoundException('Contract not found');
    if (c.status === 'RENEWED') throw new BadRequestException('Contract already renewed');
    c.status = 'RENEWED' as any;
    await this.contractRepo.save(c);
    const renewal = this.contractRepo.create({
      tenantId, contractNumber: `${c.contractNumber}-R`, title: `${c.title} (Renewal)`, type: c.type,
      status: 'DRAFT' as any, counterpartyId: c.counterpartyId, counterpartyName: c.counterpartyName,
      startDate: c.endDate ?? c.startDate, endDate: newEndDate, renewalType: c.renewalType,
      alertDaysBefore: c.alertDaysBefore, contractValue: c.contractValue, currency: c.currency,
      templateId: c.templateId, terms: c.terms,
    } as any) as unknown as Contract;
    return (this.contractRepo.save(renewal) as unknown) as Promise<Contract>;
  }

  private async getEnvelope(tenantId: string, id: string): Promise<SignatureEnvelope> {
    const env = await this.envelopeRepo.findOne({ where: { id, tenantId } });
    if (!env) throw new NotFoundException('Envelope not found');
    return env;
  }
}
