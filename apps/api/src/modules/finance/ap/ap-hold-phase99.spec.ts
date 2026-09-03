import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApHoldService } from './ap-hold.service';
import { ApHold, ApHoldType, ApHoldStatus } from './entities/ap-hold.entity';
import { Bill } from './entities/bill.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'hold-1', ...x })),
});

describe('ApHoldService — Phase 99', () => {
  let service: ApHoldService;
  let holdRepo: ReturnType<typeof mockRepo>;
  let billRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    holdRepo = mockRepo();
    billRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ApHoldService,
        { provide: getRepositoryToken(ApHold), useValue: holdRepo },
        { provide: getRepositoryToken(Bill), useValue: billRepo },
      ],
    }).compile();
    service = module.get(ApHoldService);
  });

  it('placeHold — happy path', async () => {
    billRepo.findOne.mockResolvedValue({ id: 'bill-1' });
    holdRepo.findOne.mockResolvedValue(null);
    const hold = await service.placeHold('t1', {
      billId: 'bill-1', holdType: ApHoldType.PRICE_VARIANCE, reason: 'price too high',
    });
    expect(holdRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ billId: 'bill-1', holdType: 'PRICE_VARIANCE', status: 'ACTIVE' }),
    );
    expect(hold.id).toBe('hold-1');
  });

  it('placeHold — rejects when bill not found', async () => {
    billRepo.findOne.mockResolvedValue(null);
    await expect(
      service.placeHold('t1', { billId: 'nope', holdType: ApHoldType.MANUAL, reason: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('placeHold — rejects missing reason', async () => {
    await expect(
      service.placeHold('t1', { billId: 'bill-1', holdType: ApHoldType.MANUAL, reason: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('placeHold — rejects duplicate active hold of same type', async () => {
    billRepo.findOne.mockResolvedValue({ id: 'bill-1' });
    holdRepo.findOne.mockResolvedValue({ id: 'existing', status: ApHoldStatus.ACTIVE });
    await expect(
      service.placeHold('t1', { billId: 'bill-1', holdType: ApHoldType.MANUAL, reason: 'dup' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('releaseHold — transitions to RELEASED with metadata', async () => {
    holdRepo.findOne.mockResolvedValue({ id: 'hold-1', status: ApHoldStatus.ACTIVE });
    holdRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const result = await service.releaseHold('t1', 'hold-1', { releaseReason: 'resolved', releasedById: 'u1' });
    expect(result.status).toBe(ApHoldStatus.RELEASED);
    expect(result.releaseReason).toBe('resolved');
    expect(result.releasedAt).toBeInstanceOf(Date);
  });

  it('releaseHold — rejects already released', async () => {
    holdRepo.findOne.mockResolvedValue({ id: 'hold-1', status: ApHoldStatus.RELEASED });
    await expect(
      service.releaseHold('t1', 'hold-1', { releaseReason: 'x' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('releaseHold — rejects missing releaseReason', async () => {
    holdRepo.findOne.mockResolvedValue({ id: 'hold-1', status: ApHoldStatus.ACTIVE });
    await expect(
      service.releaseHold('t1', 'hold-1', { releaseReason: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('isBillHeld — true when active hold count > 0', async () => {
    holdRepo.count.mockResolvedValue(1);
    expect(await service.isBillHeld('t1', 'bill-1')).toBe(true);
  });

  it('isBillHeld — false when no active holds', async () => {
    holdRepo.count.mockResolvedValue(0);
    expect(await service.isBillHeld('t1', 'bill-1')).toBe(false);
  });

  it('assertBillNotHeld — throws when held', async () => {
    holdRepo.count.mockResolvedValue(1);
    await expect(service.assertBillNotHeld('t1', 'bill-1')).rejects.toThrow(BadRequestException);
  });

  it('assertBillNotHeld — passes when not held', async () => {
    holdRepo.count.mockResolvedValue(0);
    await expect(service.assertBillNotHeld('t1', 'bill-1')).resolves.toBeUndefined();
  });

  it('getHeldBillIds — returns set of held bill ids', async () => {
    holdRepo.find.mockResolvedValue([{ billId: 'bill-1' }, { billId: 'bill-3' }]);
    const set = await service.getHeldBillIds('t1', ['bill-1', 'bill-2', 'bill-3']);
    expect(set.has('bill-1')).toBe(true);
    expect(set.has('bill-2')).toBe(false);
    expect(set.has('bill-3')).toBe(true);
  });

  it('getHeldBillIds — empty input → empty set, no query', async () => {
    const set = await service.getHeldBillIds('t1', []);
    expect(set.size).toBe(0);
    expect(holdRepo.find).not.toHaveBeenCalled();
  });

  it('listHolds — filters by status', async () => {
    holdRepo.find.mockResolvedValue([]);
    await service.listHolds('t1', { status: ApHoldStatus.ACTIVE });
    expect(holdRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', status: ApHoldStatus.ACTIVE } }),
    );
  });
});
