import { BadRequestException } from '@nestjs/common';
import { TravelService } from './travel.service';
import { TravelRequestStatus, TravelerType } from './entities/travel-request.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '5' }),
  }),
});

describe('TravelService — depth', () => {
  let service: TravelService;
  let requestRepo: any, commentRepo: any, automation: any;

  beforeEach(() => {
    requestRepo = mockRepo(); commentRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new TravelService(requestRepo, automation, commentRepo);
  });

  const baseDto = (over: any = {}) => ({
    employeeId: 'e1', purpose: 'Client meeting', origin: 'BLR', destination: 'DEL',
    startDate: '2026-08-01', endDate: '2026-08-03', ...over,
  });

  describe('on-behalf and guest travel', () => {
    it('accepts a guest trip with a guest name and no employee', async () => {
      const req = await service.createRequest('t1', 'admin1', baseDto({
        employeeId: undefined, travelerType: TravelerType.GUEST, guestName: 'External Consultant',
      }));
      expect(req.travelerType).toBe(TravelerType.GUEST);
      expect(req.guestName).toBe('External Consultant');
    });

    it('rejects a guest trip without a guest name', async () => {
      await expect(service.createRequest('t1', 'admin1', baseDto({
        employeeId: undefined, travelerType: TravelerType.GUEST,
      }))).rejects.toThrow('guestName is required');
    });

    it('on-behalf colleague trips keep employeeId as the traveller', async () => {
      const req = await service.createRequest('t1', 'admin1', baseDto({ travelerType: TravelerType.COLLEAGUE }));
      expect(req.travelerType).toBe(TravelerType.COLLEAGUE);
      expect(req.employeeId).toBe('e1');
      expect(req.createdByUserId).toBe('admin1');
    });
  });

  describe('accommodation legs', () => {
    it('validates legs at creation', async () => {
      await expect(service.createRequest('t1', 'u1', baseDto({
        accommodation: [{ city: 'Delhi', checkIn: '2026-08-03', checkOut: '2026-08-01' }],
      }))).rejects.toThrow('checkOut cannot precede checkIn');
    });

    it('setAccommodation replaces legs on an open trip', async () => {
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.APPROVED });
      const updated = await service.setAccommodation('t1', 'r1', [
        { city: 'Delhi', checkIn: '2026-08-01', checkOut: '2026-08-03', hotel: 'Taj', estimatedCost: 12000 },
      ]);
      expect(updated.accommodation).toHaveLength(1);
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.COMPLETED });
      await expect(service.setAccommodation('t1', 'r1', [])).rejects.toThrow('Cannot change accommodation');
    });
  });

  describe('budget-breach exception flow', () => {
    it('blocks submission over budget without a justification', async () => {
      requestRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', status: TravelRequestStatus.DRAFT,
        estimatedCost: 80000, budgetLimit: 50000, exceptionJustification: null,
      });
      await expect(service.submit('t1', 'r1')).rejects.toThrow('exception justification is required');
    });

    it('submits over budget with a justification and marks the exception', async () => {
      requestRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', tripNumber: 'TRV-000006', employeeId: 'e1', destination: 'DEL',
        status: TravelRequestStatus.DRAFT, estimatedCost: 80000, budgetLimit: 50000, advanceRequested: 0,
      });
      const submitted = await service.submit('t1', 'r1', { exceptionJustification: 'Only fare available' });
      expect(submitted.status).toBe(TravelRequestStatus.SUBMITTED);
      expect(submitted.isException).toBe(true);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'travel.submitted', expect.objectContaining({ isException: true }));
    });

    it('submits normally when within budget', async () => {
      requestRepo.findOne.mockResolvedValue({
        id: 'r1', tenantId: 't1', tripNumber: 'TRV-000006', employeeId: 'e1', destination: 'DEL',
        status: TravelRequestStatus.DRAFT, estimatedCost: 40000, budgetLimit: 50000, advanceRequested: 0,
      });
      const submitted = await service.submit('t1', 'r1');
      expect(submitted.isException).toBeFalsy();
    });
  });

  describe('cancellation with reason', () => {
    it('requires a reason to cancel an approved trip', async () => {
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.APPROVED });
      await expect(service.cancel('t1', 'r1')).rejects.toThrow('cancellation reason is required');
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.APPROVED });
      const cancelled = await service.cancel('t1', 'r1', 'Meeting postponed');
      expect(cancelled.status).toBe(TravelRequestStatus.CANCELLED);
      expect(cancelled.cancellationReason).toBe('Meeting postponed');
    });

    it('allows cancelling a draft without a reason', async () => {
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: TravelRequestStatus.DRAFT });
      const cancelled = await service.cancel('t1', 'r1');
      expect(cancelled.status).toBe(TravelRequestStatus.CANCELLED);
    });
  });

  describe('chat thread', () => {
    it('adds and lists comments with sender roles', async () => {
      requestRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1' });
      const comment = await service.addComment('t1', 'r1', { userId: 'agent1', name: 'Travel Agent', role: 'AGENT' }, 'Flight booked');
      expect(comment).toMatchObject({ authorRole: 'AGENT', body: 'Flight booked', requestId: 'r1' });
      await service.listComments('t1', 'r1');
      expect(commentRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: 't1', requestId: 'r1' },
      }));
    });
  });
});
