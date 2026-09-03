import { ConflictException, NotFoundException } from '@nestjs/common';
import { TaxService } from './tax.service';
import { TaxType } from './entities/tax-code.entity';

/**
 * Tax engine: component auto-derivation per tax type (CGST/SGST split,
 * IGST, TDS), per-component calculation with rounding, tax-line
 * persistence per document, and code uniqueness.
 */
describe('TaxService', () => {
  let service: TaxService;
  let taxCodeRepository: any, taxLineRepository: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    taxCodeRepository = mockRepo(); taxLineRepository = mockRepo();
    service = new TaxService(taxCodeRepository, taxLineRepository);
  });

  it('GST CGST+SGST auto-splits the rate into two equal components', async () => {
    const code = await service.createTaxCode('t1', { code: 'GST18', name: 'GST 18%', type: TaxType.GST_CGST_SGST, rate: 18 } as any);
    expect(code.components).toEqual([
      { name: 'CGST', rate: 9 },
      { name: 'SGST', rate: 9 },
    ]);
  });

  it('IGST and WITHHOLDING derive single components; duplicates are rejected', async () => {
    const igst = await service.createTaxCode('t1', { code: 'IGST18', name: 'IGST', type: TaxType.GST_IGST, rate: 18 } as any);
    expect(igst.components).toEqual([{ name: 'IGST', rate: 18 }]);

    const tds = await service.createTaxCode('t1', { code: 'TDS10', name: 'TDS', type: TaxType.WITHHOLDING, rate: 10 } as any);
    expect(tds.components).toEqual([{ name: 'TDS', rate: 10 }]);

    taxCodeRepository.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createTaxCode('t1', { code: 'GST18', name: 'x', type: TaxType.VAT, rate: 5 } as any)).rejects.toThrow(ConflictException);
  });

  it('calculateTax breaks the amount down per component with 2dp rounding', () => {
    const result = service.calculateTax({
      name: 'GST 18%', rate: 18,
      components: [{ name: 'CGST', rate: 9 }, { name: 'SGST', rate: 9 }],
    } as any, 999.99);
    expect(result).toEqual([
      { componentName: 'CGST', rate: 9, taxAmount: 90 },
      { componentName: 'SGST', rate: 9, taxAmount: 90 },
    ]);
  });

  it('calculateTax falls back to the overall rate without components', () => {
    const result = service.calculateTax({ name: 'VAT 5%', rate: 5, components: [] } as any, 200);
    expect(result).toEqual([{ componentName: 'VAT 5%', rate: 5, taxAmount: 10 }]);
  });

  it('saveTaxLines persists one line per component tagged to the document', async () => {
    taxCodeRepository.findOne.mockResolvedValue({
      id: 'tc1', code: 'GST18', name: 'GST 18%', rate: 18,
      components: [{ name: 'CGST', rate: 9 }, { name: 'SGST', rate: 9 }],
    });
    await service.saveTaxLines('t1', 'AR_INVOICE' as any, 'doc-1', 'tc1', 1000);
    expect(taxLineRepository.create).toHaveBeenCalledTimes(2);
    expect(taxLineRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-1', componentName: 'CGST', baseAmount: 1000, taxAmount: 90,
    }));
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.findById('t2', 'ghost')).rejects.toThrow(NotFoundException);
    expect(taxCodeRepository.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'ghost' } });
  });
});
