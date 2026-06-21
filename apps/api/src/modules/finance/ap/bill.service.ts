import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bill, BillStatus } from './entities/bill.entity';
import { CreateBillDto } from './dto/bill.dto';
import { TaxService } from '../tax/tax.service';
import { TaxDocumentType } from '../tax/entities/tax-line.entity';

@Injectable()
export class BillService {
  constructor(
    @InjectRepository(Bill)
    private readonly billRepository: Repository<Bill>,
    private readonly taxService: TaxService,
  ) {}

  async create(tenantId: string, dto: CreateBillDto): Promise<Bill> {
    const bill = this.billRepository.create({
      tenantId,
      ...dto,
      subTotal: dto.subTotal,
      taxAmount: 0,
      totalAmount: dto.subTotal,
    });
    return this.billRepository.save(bill);
  }

  async findAll(tenantId: string): Promise<Bill[]> {
    return this.billRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Bill> {
    const bill = await this.billRepository.findOne({ where: { tenantId, id } });
    if (!bill) throw new NotFoundException('Bill not found');
    return bill;
  }

  async postBill(tenantId: string, id: string): Promise<Bill> {
    const bill = await this.findById(tenantId, id);

    // Clean previous tax lines in case of re-posting
    await this.taxService.deleteTaxLines(tenantId, TaxDocumentType.BILL, id);

    let taxAmount = 0;

    if (bill.taxCodeId) {
      const lines = await this.taxService.saveTaxLines(
        tenantId,
        TaxDocumentType.BILL,
        id,
        bill.taxCodeId,
        Number(bill.subTotal),
      );
      taxAmount = lines.reduce((sum, l) => sum + Number(l.taxAmount), 0);
    }

    bill.taxAmount = taxAmount;
    bill.totalAmount = Number(bill.subTotal) + taxAmount;
    bill.status = BillStatus.POSTED;

    return this.billRepository.save(bill);
  }

  async getTaxLines(tenantId: string, id: string) {
    return this.taxService.getTaxLines(tenantId, TaxDocumentType.BILL, id);
  }
}
