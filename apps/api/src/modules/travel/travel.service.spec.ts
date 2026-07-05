import { BadRequestException } from '@nestjs/common';
import { TravelService } from './travel.service';
import { TravelRequestStatus } from './entities/travel-request.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'trv-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '7' }),
  })),
});

describe('TravelService', () => {
  let service: TravelService;
  let repo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  const baseDto = {
    employeeId: 'e1', purpose: 'Client visit', origin: 'BLR', destination: 'DEL',
    startDate: '2026-08-01', endDate: '2026-08-03', estimatedCost: 25000, advanceRequested: 10000,
  };

  beforeEach(() => {
    repo = mockRepo();
    automation.emit.mockClear();
    service = new TravelService(repo, automation as any);
  });

  it('creates numbered draft requests and validates dates', async () => {
    const created = await service.createRequest('t1', 'u1', { ...baseDto });
    expect(created.tripNumber).toBe('TRV-000008');
    expect(created.status).toBe(TravelRequestStatus.DRAFT);
    await expect(service.createRequest('t1', 'u1', { ...baseDto, endDate: '2026-07-30' }))
      .rejects.toThrow('End date cannot be before start date');
    await expect(service.createRequest('t1', 'u1', { ...baseDto, advanceRequested: -5 }))
      .rejects.toThrow('Amounts cannot be negative');
  });

  it('create with submit=true goes straight to SUBMITTED and emits travel.submitted', async () => {
    repo.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: where.id, tenantId: 't1', ...baseDto, tripNumber: 'TRV-000008', status: TravelRequestStatus.DRAFT }));
    const saved = await service.createRequest('t1', 'u1', { ...baseDto, submit: true });
    expect(saved.status).toBe(TravelRequestStatus.SUBMITTED);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'travel.submitted', expect.objectContaining({
      tripNumber: 'TRV-000008', advanceRequested: 10000,
    }));
  });

  it('approval stamps approver and emits travel.approved; only SUBMITTED can be approved', async () => {
    repo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', ...baseDto, tripNumber: 'TRV-000001', status: TravelRequestStatus.SUBMITTED });
    const saved = await service.approve('t1', 'r1', 'mgr1');
    expect(saved.approvedById).toBe('mgr1');
    expect(saved.approvedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'travel.approved', expect.objectContaining({ approvedById: 'mgr1' }));
    repo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.DRAFT });
    await expect(service.approve('t1', 'r1', 'mgr1')).rejects.toThrow(BadRequestException);
  });

  it('rejection requires a reason and emits travel.rejected', async () => {
    repo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', ...baseDto, tripNumber: 'TRV-000001', status: TravelRequestStatus.SUBMITTED });
    await expect(service.reject('t1', 'r1', '  ')).rejects.toThrow('rejection reason');
    const saved = await service.reject('t1', 'r1', 'Budget freeze');
    expect(saved.rejectionReason).toBe('Budget freeze');
    expect(automation.emit).toHaveBeenCalledWith('t1', 'travel.rejected', expect.objectContaining({ reason: 'Budget freeze' }));
  });

  it('completion links the expense claim; cancelled/completed cannot be cancelled', async () => {
    repo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.APPROVED });
    const done = await service.complete('t1', 'r1', 'claim-9');
    expect(done.status).toBe(TravelRequestStatus.COMPLETED);
    expect(done.expenseClaimId).toBe('claim-9');
    repo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.COMPLETED });
    await expect(service.cancel('t1', 'r1')).rejects.toThrow('Cannot cancel');
  });
});
