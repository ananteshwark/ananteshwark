import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EdiTradingPartner } from './entities/edi-trading-partner.entity';
import {
  EdiTransaction,
  EdiDirection,
  EdiTransactionStatus,
} from './entities/edi-transaction.entity';
import {
  CreateTradingPartnerDto,
  UpdateTradingPartnerDto,
  ListTransactionsQueryDto,
} from './dto/edi.dto';
import {
  parseEdi850,
  parseEdi855,
  parseEdi856,
  parseEdi810,
  buildEdi850,
} from './parsers/edi-x12.parser';

let _controlCounter = 1;
function nextControlNumber(): string {
  return String(_controlCounter++).padStart(9, '0');
}

@Injectable()
export class EdiService {
  constructor(
    @InjectRepository(EdiTradingPartner)
    private readonly partnerRepo: Repository<EdiTradingPartner>,
    @InjectRepository(EdiTransaction)
    private readonly txnRepo: Repository<EdiTransaction>,
  ) {}

  // -------------------------------------------------------------------------
  // Trading Partners
  // -------------------------------------------------------------------------

  async listPartners(tenantId: string) {
    return this.partnerRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async getPartner(tenantId: string, id: string) {
    const p = await this.partnerRepo.findOne({ where: { tenantId, id } });
    if (!p) throw new NotFoundException('Trading partner not found');
    return p;
  }

  async createPartner(tenantId: string, dto: CreateTradingPartnerDto) {
    const partner = this.partnerRepo.create({ ...dto, tenantId });
    return this.partnerRepo.save(partner);
  }

  async updatePartner(tenantId: string, id: string, dto: UpdateTradingPartnerDto) {
    const partner = await this.getPartner(tenantId, id);
    Object.assign(partner, dto);
    return this.partnerRepo.save(partner);
  }

  async deletePartner(tenantId: string, id: string) {
    const partner = await this.getPartner(tenantId, id);
    await this.partnerRepo.remove(partner);
  }

  // -------------------------------------------------------------------------
  // Transaction Log
  // -------------------------------------------------------------------------

  async listTransactions(tenantId: string, query: ListTransactionsQueryDto) {
    const qb = this.txnRepo
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId })
      .orderBy('t.createdAt', 'DESC');

    if (query.tradingPartnerId) qb.andWhere('t.tradingPartnerId = :tp', { tp: query.tradingPartnerId });
    if (query.transactionSet) qb.andWhere('t.transactionSet = :ts', { ts: query.transactionSet });
    if (query.direction) qb.andWhere('t.direction = :dir', { dir: query.direction });
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });

    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);
    const offset = parseInt(query.offset ?? '0', 10);
    qb.limit(limit).offset(offset);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getTransaction(tenantId: string, id: string) {
    const t = await this.txnRepo.findOne({ where: { tenantId, id } });
    if (!t) throw new NotFoundException('EDI transaction not found');
    return t;
  }

  // -------------------------------------------------------------------------
  // Inbound EDI Processing
  // -------------------------------------------------------------------------

  async processInbound(tenantId: string, tradingPartnerId: string, rawContent: string) {
    await this.getPartner(tenantId, tradingPartnerId);

    // Detect transaction set from ST segment
    const stMatch = rawContent.match(/ST\*(\d{3})\*/);
    if (!stMatch) throw new BadRequestException('Cannot determine EDI transaction set');
    const transactionSet = stMatch[1];

    const txn = this.txnRepo.create({
      tenantId,
      tradingPartnerId,
      transactionSet,
      direction: EdiDirection.INBOUND,
      rawContent,
      status: EdiTransactionStatus.PROCESSING,
    });
    await this.txnRepo.save(txn);

    try {
      let parsedPayload: Record<string, unknown> = {};

      switch (transactionSet) {
        case '850':
          parsedPayload = parseEdi850(rawContent) as unknown as Record<string, unknown>;
          break;
        case '855':
          parsedPayload = parseEdi855(rawContent) as unknown as Record<string, unknown>;
          break;
        case '856':
          parsedPayload = parseEdi856(rawContent) as unknown as Record<string, unknown>;
          break;
        case '810':
          parsedPayload = parseEdi810(rawContent) as unknown as Record<string, unknown>;
          break;
        default:
          throw new BadRequestException(`Unsupported transaction set: ${transactionSet}`);
      }

      txn.parsedPayload = parsedPayload;
      txn.status = EdiTransactionStatus.PROCESSED;
      await this.txnRepo.save(txn);
      return txn;
    } catch (err) {
      txn.status = EdiTransactionStatus.FAILED;
      txn.errorMessage = err instanceof Error ? err.message : String(err);
      await this.txnRepo.save(txn);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Outbound EDI Generation
  // -------------------------------------------------------------------------

  async generateOutbound850(
    tenantId: string,
    tradingPartnerId: string,
    poData: {
      purchaseOrderNumber: string;
      vendorName?: string;
      lineItems: Array<{
        lineNumber: number;
        quantity: number;
        unit: string;
        unitPrice: number;
        productCode: string;
        description?: string;
      }>;
    },
  ) {
    const partner = await this.getPartner(tenantId, tradingPartnerId);

    const rawContent = buildEdi850({
      senderId: partner.senderId,
      senderQualifier: partner.senderQualifier,
      receiverId: partner.partnerId,
      receiverQualifier: partner.idQualifier,
      controlNumber: nextControlNumber(),
      purchaseOrderNumber: poData.purchaseOrderNumber,
      vendorName: poData.vendorName,
      lineItems: poData.lineItems,
    });

    const txn = this.txnRepo.create({
      tenantId,
      tradingPartnerId,
      transactionSet: '850',
      direction: EdiDirection.OUTBOUND,
      referenceNumber: poData.purchaseOrderNumber,
      rawContent,
      status: EdiTransactionStatus.SENT,
      parsedPayload: poData as unknown as Record<string, unknown>,
    });
    await this.txnRepo.save(txn);
    return { txn, rawContent };
  }
}
