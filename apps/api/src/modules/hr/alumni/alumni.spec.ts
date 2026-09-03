import { BadRequestException } from '@nestjs/common';
import { AlumniService } from './alumni.service';
import { AlumniStatus, AlumniTicketCategory, AlumniTicketStatus } from './entities/alumni.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('AlumniService', () => {
  let service: AlumniService;
  let profileRepo: any, docRepo: any, ticketRepo: any, automation: any;

  beforeEach(() => {
    profileRepo = mockRepo(); docRepo = mockRepo(); ticketRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new AlumniService(profileRepo, docRepo, ticketRepo, automation);
  });

  describe('profiles', () => {
    it('invites a departing employee and emits alumni.invited', async () => {
      profileRepo.findOne.mockResolvedValue(null);
      const p = await service.invite('t1', { employeeId: 'e1', fullName: 'Ann', exitDate: '2026-06-30' });
      expect(p).toMatchObject({ status: AlumniStatus.INVITED, rehireEligible: true });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'alumni.invited', expect.objectContaining({ employeeId: 'e1' }));
    });

    it('rejects a duplicate alumni profile', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'a1' });
      await expect(service.invite('t1', { employeeId: 'e1', fullName: 'Ann' })).rejects.toThrow(BadRequestException);
    });

    it('activates a profile and stamps activatedAt once', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: AlumniStatus.INVITED, activatedAt: null });
      const p = await service.activate('t1', 'a1');
      expect(p.status).toBe(AlumniStatus.ACTIVE);
      expect(p.activatedAt).toBeInstanceOf(Date);
    });

    it('self-service update only touches whitelisted fields', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', fullName: 'Ann', status: AlumniStatus.ACTIVE });
      const p = await service.updateProfile('t1', 'a1', { currentEmployer: 'Acme', directoryOptIn: true, status: AlumniStatus.DEACTIVATED } as any);
      expect(p.currentEmployer).toBe('Acme');
      expect(p.directoryOptIn).toBe(true);
      expect(p.status).toBe(AlumniStatus.ACTIVE); // status not writable via self-service
    });

    it('deactivating clears the directory opt-in', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: AlumniStatus.ACTIVE, directoryOptIn: true });
      const p = await service.deactivate('t1', 'a1');
      expect(p.status).toBe(AlumniStatus.DEACTIVATED);
      expect(p.directoryOptIn).toBe(false);
    });

    it('lists rehire candidates', async () => {
      profileRepo.find.mockResolvedValue([{ id: 'a1', willingToBeRehired: true }]);
      const list = await service.rehireCandidates('t1');
      expect(profileRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ willingToBeRehired: true, rehireEligible: true }) }));
      expect(list).toHaveLength(1);
    });
  });

  describe('tickets', () => {
    it('raises a ticket and emits an event', async () => {
      profileRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1' });
      const t = await service.raiseTicket('t1', 'a1', { category: AlumniTicketCategory.DOCUMENT_REQUEST, subject: 'Need payslip' });
      expect(t).toMatchObject({ status: AlumniTicketStatus.OPEN, category: AlumniTicketCategory.DOCUMENT_REQUEST });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'alumni.ticket_raised', expect.objectContaining({ category: AlumniTicketCategory.DOCUMENT_REQUEST }));
    });

    it('assigning an open ticket moves it to IN_PROGRESS', async () => {
      ticketRepo.findOne.mockResolvedValue({ id: 't1', tenantId: 't1', status: AlumniTicketStatus.OPEN });
      const t = await service.assignTicket('t1', 't1', 'u1');
      expect(t).toMatchObject({ assignedToUserId: 'u1', status: AlumniTicketStatus.IN_PROGRESS });
    });

    it('resolving a ticket stamps resolvedAt', async () => {
      ticketRepo.findOne.mockResolvedValue({ id: 't1', tenantId: 't1', status: AlumniTicketStatus.IN_PROGRESS });
      const t = await service.resolveTicket('t1', 't1', 'Sent payslip');
      expect(t.status).toBe(AlumniTicketStatus.RESOLVED);
      expect(t.resolvedAt).toBeInstanceOf(Date);
    });

    it('cannot resolve a closed ticket', async () => {
      ticketRepo.findOne.mockResolvedValue({ id: 't1', tenantId: 't1', status: AlumniTicketStatus.CLOSED });
      await expect(service.resolveTicket('t1', 't1', 'x')).rejects.toThrow(BadRequestException);
    });
  });
});
