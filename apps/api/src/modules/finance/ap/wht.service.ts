import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { SequenceService } from '../../../common/sequence/sequence.service';
import { ApWhtCode, WhtCertificateType } from './entities/ap-wht-code.entity';
import { WhtCertificate } from './entities/wht-certificate.entity';
import { Bill } from './entities/bill.entity';
import { Vendor } from './entities/vendor.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface WhtComputation {
  applicable: boolean;
  whtAmount: number;
  rate: number;
  reason: string;
}

@Injectable()
export class WhtService {
  constructor(
    @InjectRepository(ApWhtCode) private readonly codeRepo: Repository<ApWhtCode>,
    @InjectRepository(WhtCertificate) private readonly certRepo: Repository<WhtCertificate>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly sequence: SequenceService,
  ) {}

  // ─── Ph-103: WHT Codes ────────────────────────────────────────────

  async listCodes(tenantId: string): Promise<ApWhtCode[]> {
    return this.codeRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async getCode(tenantId: string, id: string): Promise<ApWhtCode> {
    const code = await this.codeRepo.findOne({ where: { id, tenantId } });
    if (!code) throw new NotFoundException(`WHT code ${id} not found`);
    return code;
  }

  async createCode(tenantId: string, data: {
    code: string; name: string; section?: string; rate: number;
    thresholdAmount?: number; certificateType?: WhtCertificateType;
    applicableVendorType?: string; liabilityAccountCode?: string; isActive?: boolean;
  }): Promise<ApWhtCode> {
    if (!data.code) throw new BadRequestException('code is required');
    if (data.rate == null || data.rate < 0) throw new BadRequestException('rate must be >= 0');
    const existing = await this.codeRepo.findOne({ where: { tenantId, code: data.code } });
    if (existing) throw new BadRequestException(`WHT code ${data.code} already exists`);
    const entity = this.codeRepo.create({
      tenantId,
      code: data.code,
      name: data.name,
      section: data.section ?? null,
      rate: data.rate,
      thresholdAmount: data.thresholdAmount ?? 0,
      certificateType: data.certificateType ?? WhtCertificateType.FORM_16A,
      applicableVendorType: data.applicableVendorType ?? null,
      liabilityAccountCode: data.liabilityAccountCode ?? null,
      isActive: data.isActive !== false,
    } as any) as unknown as ApWhtCode;
    return (this.codeRepo.save(entity) as unknown) as Promise<ApWhtCode>;
  }

  async updateCode(tenantId: string, id: string, data: Partial<ApWhtCode>): Promise<ApWhtCode> {
    const code = await this.getCode(tenantId, id);
    Object.assign(code, data);
    return (this.codeRepo.save(code) as unknown) as Promise<ApWhtCode>;
  }

  async deleteCode(tenantId: string, id: string): Promise<void> {
    const code = await this.getCode(tenantId, id);
    await this.codeRepo.remove(code);
  }

  // ─── Ph-104: WHT Calculation Engine ───────────────────────────────

  /**
   * Compute WHT for a gross amount under a code. Honours the threshold:
   * no withholding when gross is below the threshold.
   */
  computeWht(grossAmount: number, code: ApWhtCode): WhtComputation {
    if (!code.isActive) {
      return { applicable: false, whtAmount: 0, rate: 0, reason: 'WHT code inactive' };
    }
    if (grossAmount < Number(code.thresholdAmount)) {
      return {
        applicable: false,
        whtAmount: 0,
        rate: Number(code.rate),
        reason: `Gross ${grossAmount} below threshold ${code.thresholdAmount}`,
      };
    }
    const whtAmount = round2((grossAmount * Number(code.rate)) / 100);
    return {
      applicable: whtAmount > 0,
      whtAmount,
      rate: Number(code.rate),
      reason: whtAmount > 0 ? `WHT ${code.rate}% on ${grossAmount}` : 'Computed WHT is zero',
    };
  }

  /** Resolve a code and compute WHT for a bill's taxable base. */
  async computeForBill(tenantId: string, whtCodeId: string, grossAmount: number): Promise<WhtComputation & { code: ApWhtCode }> {
    const code = await this.getCode(tenantId, whtCodeId);
    return { ...this.computeWht(grossAmount, code), code };
  }

  // ─── Ph-105: WHT Certificates ─────────────────────────────────────

  async listCertificates(tenantId: string, vendorId?: string): Promise<WhtCertificate[]> {
    const where: any = { tenantId };
    if (vendorId) where.vendorId = vendorId;
    return this.certRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Generate a WHT certificate for a vendor over a date range by aggregating
   * posted bills that carry WHT. Oracle Form 16A / 1099 equivalent.
   */
  async generateCertificate(tenantId: string, data: {
    vendorId: string; fiscalYear: string; periodFrom: string; periodTo: string;
  }): Promise<WhtCertificate> {
    const vendor = await this.vendorRepo.findOne({ where: { id: data.vendorId, tenantId } });
    if (!vendor) throw new NotFoundException(`Vendor ${data.vendorId} not found`);

    const bills = await this.billRepo.find({
      where: {
        tenantId,
        vendorId: data.vendorId,
        billDate: Between(data.periodFrom, data.periodTo),
      },
    });
    const whtBills = bills.filter((b) => Number(b.whtAmount) > 0);
    if (whtBills.length === 0) {
      throw new BadRequestException('No bills with withholding tax in the selected period');
    }

    const grossAmount = round2(whtBills.reduce((s, b) => s + Number(b.subtotal), 0));
    const whtAmount = round2(whtBills.reduce((s, b) => s + Number(b.whtAmount), 0));

    // resolve common section/code from the first WHT code present
    let section: string | null = null;
    let whtCode: string | null = null;
    let certType: WhtCertificateType = WhtCertificateType.FORM_16A;
    const firstCodeId = whtBills.find((b) => b.whtCodeId)?.whtCodeId;
    if (firstCodeId) {
      const code = await this.codeRepo.findOne({ where: { id: firstCodeId, tenantId } });
      if (code) {
        section = code.section;
        whtCode = code.code;
        certType = code.certificateType;
      }
    }

    const certNumber = await this.nextCertNumber(tenantId);
    const cert = this.certRepo.create({
      tenantId,
      certificateNumber: certNumber,
      vendorId: data.vendorId,
      vendorName: vendor.name,
      whtCode,
      section,
      certificateType: certType,
      fiscalYear: data.fiscalYear,
      periodFrom: data.periodFrom,
      periodTo: data.periodTo,
      grossAmount,
      whtAmount,
      billCount: whtBills.length,
      lineItems: whtBills.map((b) => ({
        billNumber: b.billNumber,
        billDate: b.billDate,
        gross: Number(b.subtotal),
        wht: Number(b.whtAmount),
      })),
    } as any) as unknown as WhtCertificate;
    return (this.certRepo.save(cert) as unknown) as Promise<WhtCertificate>;
  }

  private async nextCertNumber(tenantId: string): Promise<string> {
    return this.sequence.formatted(tenantId, 'wht-certificate', 'WHT-', 6);
  }
}
