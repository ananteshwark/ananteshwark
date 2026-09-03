import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AtpService } from './atp.service';
import { StockBalance } from '../inventory/entities/stock-balance.entity';

describe('AtpService.issueForItem — ship relieves stock (H3)', () => {
  let service: AtpService;
  let balanceRepo: any;

  beforeEach(async () => {
    balanceRepo = { find: jest.fn(), save: jest.fn((x) => Promise.resolve(x)) };
    const moduleRef = await Test.createTestingModule({
      providers: [AtpService, { provide: getRepositoryToken(StockBalance), useValue: balanceRepo }],
    }).compile();
    service = moduleRef.get(AtpService);
  });

  it('throws when on-hand is insufficient (prevents oversell)', async () => {
    balanceRepo.find.mockResolvedValue([{ warehouseId: 'w1', qtyOnHand: 3, committedQty: 3 }]);
    await expect(service.issueForItem('t1', 'item1', 5)).rejects.toBeInstanceOf(BadRequestException);
    expect(balanceRepo.save).not.toHaveBeenCalled();
  });

  it('decrements on-hand and releases committed qty across warehouses', async () => {
    const w1: any = { warehouseId: 'w1', qtyOnHand: 4, committedQty: 4 };
    const w2: any = { warehouseId: 'w2', qtyOnHand: 6, committedQty: 2 };
    balanceRepo.find.mockResolvedValue([w1, w2]);
    await service.issueForItem('t1', 'item1', 7); // takes 6 from w2 (most stocked), 1 from w1
    expect(w2.qtyOnHand).toBe(0);
    expect(w1.qtyOnHand).toBe(3);
    // committed relieved by the amount taken, floored at 0
    expect(w2.committedQty).toBe(0);
    expect(w1.committedQty).toBe(3);
  });
});
