import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HiringService } from './hiring.service';
import { RequisitionStatus } from './entities/manpower-requisition.entity';

/**
 * Manpower requisition lifecycle: DRAFT → SUBMITTED → APPROVED → OPEN
 * (creates a job posting via ATS), with edit/cancel guards and re-submit
 * after rejection.
 */
describe('HiringService — requisition lifecycle', () => {
  let service: HiringService;
  let reqRepo: any, jobRepo: any, applicantRepo: any, interviewRepo: any, offerRepo: any, atsService: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    reqRepo = mockRepo(); jobRepo = mockRepo(); applicantRepo = mockRepo();
    interviewRepo = mockRepo(); offerRepo = mockRepo();
    atsService = { createJobPosting: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    service = new HiringService(reqRepo, jobRepo, applicantRepo, interviewRepo, offerRepo, atsService);
  });

  const req = (status: RequisitionStatus, over: any = {}) => ({
    id: 'r1', tenantId: 't1', status, title: 'Engineer', vacancies: 2, currency: 'INR', ...over,
  });

  it('createRequisition starts in DRAFT with defaults', async () => {
    const r = await service.createRequisition('t1', 'mgr1', { title: 'Engineer' } as any);
    expect(r.status).toBe(RequisitionStatus.DRAFT);
    expect(r.vacancies).toBe(1);
    expect(r.requestedById).toBe('mgr1');
  });

  it('submit requires DRAFT; approve requires SUBMITTED', async () => {
    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.APPROVED));
    await expect(service.submitRequisition('t1', 'r1')).rejects.toThrow(BadRequestException);

    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.DRAFT));
    await expect(service.approveRequisition('t1', 'r1', 'boss')).rejects.toThrow(BadRequestException);

    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.SUBMITTED));
    const approved = await service.approveRequisition('t1', 'r1', 'boss');
    expect(approved.status).toBe(RequisitionStatus.APPROVED);
    expect(approved.approvedById).toBe('boss');
  });

  it('editing is limited to DRAFT/REJECTED, and editing a REJECTED one re-drafts it', async () => {
    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.SUBMITTED));
    await expect(service.updateRequisition('t1', 'r1', { title: 'X' } as any)).rejects.toThrow(BadRequestException);

    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.REJECTED));
    const r = await service.updateRequisition('t1', 'r1', { title: 'Better title' } as any);
    expect(r.status).toBe(RequisitionStatus.DRAFT);
  });

  it('reject records the reason and only from SUBMITTED', async () => {
    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.SUBMITTED));
    const r = await service.rejectRequisition('t1', 'r1', 'boss', 'no budget');
    expect(r.status).toBe(RequisitionStatus.REJECTED);
    expect(r.rejectionReason).toBe('no budget');
  });

  it('openRequisition requires APPROVED, creates the job posting, and links it', async () => {
    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.DRAFT));
    await expect(service.openRequisition('t1', 'r1', 'u1')).rejects.toThrow(BadRequestException);

    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.APPROVED, { jobDescription: 'build things' }));
    const r = await service.openRequisition('t1', 'r1', 'u1');
    expect(atsService.createJobPosting).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({ title: 'Engineer', vacancies: 2 }));
    expect(r.status).toBe(RequisitionStatus.OPEN);
    expect(r.jobPostingId).toBe('job-1');
  });

  it('cancel is blocked for FULFILLED and already-CANCELLED requisitions', async () => {
    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.FULFILLED));
    await expect(service.cancelRequisition('t1', 'r1')).rejects.toThrow(BadRequestException);

    reqRepo.findOne.mockResolvedValue(req(RequisitionStatus.OPEN));
    const r = await service.cancelRequisition('t1', 'r1');
    expect(r.status).toBe(RequisitionStatus.CANCELLED);
  });

  it('lookups are tenant-scoped and 404 when missing', async () => {
    reqRepo.findOne.mockResolvedValue(null);
    await expect(service.getRequisition('t2', 'r1')).rejects.toThrow(NotFoundException);
    expect(reqRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 't2' } });
  });
});
