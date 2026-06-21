import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxCode, TaxType } from './entities/tax-code.entity';
import { TaxLine, TaxDocumentType } from './entities/tax-line.entity';
import { CreateTaxCodeDto, UpdateTaxCodeDto } from './dto/tax.dto';

export interface TaxCalculationResult {
  componentName: string;
  rate: number;
  taxAmount: number;
}

@Injectable()
export class TaxService {
  constructor(
    @InjectRepository(TaxCode)
    private readonly taxCodeRepository: Repository<TaxCode>,
    @InjectRepository(TaxLine)
    private readonly taxLineRepository: Repository<TaxLine>,
  ) {}

  async createTaxCode(tenantId: string, dto: CreateTaxCodeDto): Promise<TaxCode> {
    const existing = await this.taxCodeRepository.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Tax code '${dto.code}' already exists`);
    }

    // Auto-derive components if not provided
    const components = dto.components && dto.components.length > 0
      ? dto.components
      : this.deriveDefaultComponents(dto.type, dto.rate);

    const taxCode = this.taxCodeRepository.create({
      tenantId,
      ...dto,
      components,
    });
    return this.taxCodeRepository.save(taxCode);
  }

  async updateTaxCode(tenantId: string, id: string, dto: UpdateTaxCodeDto): Promise<TaxCode> {
    const taxCode = await this.taxCodeRepository.findOne({ where: { tenantId, id } });
    if (!taxCode) {
      throw new NotFoundException(`Tax code not found`);
    }
    Object.assign(taxCode, dto);
    return this.taxCodeRepository.save(taxCode);
  }

  async listTaxCodes(tenantId: string): Promise<TaxCode[]> {
    return this.taxCodeRepository.find({
      where: { tenantId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<TaxCode> {
    const taxCode = await this.taxCodeRepository.findOne({ where: { tenantId, id } });
    if (!taxCode) {
      throw new NotFoundException(`Tax code not found`);
    }
    return taxCode;
  }

  /**
   * Pure calculation — no side effects. Returns breakdown by component.
   */
  calculateTax(taxCode: TaxCode, baseAmount: number): TaxCalculationResult[] {
    if (!taxCode.components || taxCode.components.length === 0) {
      // Fall back to overall rate as single component
      const taxAmount = this.round((Number(baseAmount) * Number(taxCode.rate)) / 100);
      return [{ componentName: taxCode.name, rate: Number(taxCode.rate), taxAmount }];
    }

    return taxCode.components.map((comp) => {
      const taxAmount = this.round((Number(baseAmount) * Number(comp.rate)) / 100);
      return { componentName: comp.name, rate: Number(comp.rate), taxAmount };
    });
  }

  async calculateTaxById(
    tenantId: string,
    taxCodeId: string,
    baseAmount: number,
  ): Promise<TaxCalculationResult[]> {
    const taxCode = await this.findById(tenantId, taxCodeId);
    return this.calculateTax(taxCode, baseAmount);
  }

  async saveTaxLines(
    tenantId: string,
    documentType: TaxDocumentType,
    documentId: string,
    taxCodeId: string,
    baseAmount: number,
  ): Promise<TaxLine[]> {
    const taxCode = await this.findById(tenantId, taxCodeId);
    const calculations = this.calculateTax(taxCode, baseAmount);

    const lines = calculations.map((calc) =>
      this.taxLineRepository.create({
        tenantId,
        documentType,
        documentId,
        taxCodeId,
        taxCodeCode: taxCode.code,
        taxCodeName: taxCode.name,
        componentName: calc.componentName,
        rate: calc.rate,
        baseAmount: Number(baseAmount),
        taxAmount: calc.taxAmount,
      }),
    );

    return this.taxLineRepository.save(lines);
  }

  async getTaxLines(
    tenantId: string,
    documentType: TaxDocumentType,
    documentId: string,
  ): Promise<TaxLine[]> {
    return this.taxLineRepository.find({
      where: { tenantId, documentType, documentId },
    });
  }

  async deleteTaxLines(
    tenantId: string,
    documentType: TaxDocumentType,
    documentId: string,
  ): Promise<void> {
    await this.taxLineRepository.delete({ tenantId, documentType, documentId });
  }

  async taxSummaryReport(
    tenantId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    taxCodeCode: string;
    taxCodeName: string;
    componentName: string;
    documentType: string;
    totalBaseAmount: number;
    totalTaxAmount: number;
    lineCount: number;
  }[]> {
    const result = await this.taxLineRepository
      .createQueryBuilder('tl')
      .select('tl.taxCodeCode', 'taxCodeCode')
      .addSelect('tl.taxCodeName', 'taxCodeName')
      .addSelect('tl.componentName', 'componentName')
      .addSelect('tl.documentType', 'documentType')
      .addSelect('SUM(tl.baseAmount)', 'totalBaseAmount')
      .addSelect('SUM(tl.taxAmount)', 'totalTaxAmount')
      .addSelect('COUNT(*)', 'lineCount')
      .where('tl.tenantId = :tenantId', { tenantId })
      .andWhere('tl.createdAt >= :fromDate', { fromDate })
      .andWhere('tl.createdAt <= :toDate', { toDate })
      .groupBy('tl.taxCodeCode')
      .addGroupBy('tl.taxCodeName')
      .addGroupBy('tl.componentName')
      .addGroupBy('tl.documentType')
      .orderBy('tl.taxCodeCode', 'ASC')
      .addOrderBy('tl.componentName', 'ASC')
      .getRawMany();

    return result.map((r) => ({
      taxCodeCode: r.taxCodeCode,
      taxCodeName: r.taxCodeName,
      componentName: r.componentName,
      documentType: r.documentType,
      totalBaseAmount: Number(r.totalBaseAmount),
      totalTaxAmount: Number(r.totalTaxAmount),
      lineCount: Number(r.lineCount),
    }));
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private deriveDefaultComponents(type: TaxType, totalRate: number) {
    switch (type) {
      case TaxType.GST_CGST_SGST: {
        const half = this.round(totalRate / 2);
        return [
          { name: 'CGST', rate: half },
          { name: 'SGST', rate: half },
        ];
      }
      case TaxType.GST_IGST:
        return [{ name: 'IGST', rate: totalRate }];
      case TaxType.VAT:
        return [{ name: 'VAT', rate: totalRate }];
      case TaxType.WITHHOLDING:
        return [{ name: 'TDS', rate: totalRate }];
      default:
        return [];
    }
  }
}
