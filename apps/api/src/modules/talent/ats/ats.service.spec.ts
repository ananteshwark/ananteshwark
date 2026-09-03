import { NotFoundException } from '@nestjs/common';
import { AtsService } from './ats.service';
import { JobStatus } from './entities/job-posting.entity';
import { ApplicantStatus } from './entities/applicant.entity';
import { InterviewStatus } from './entities/interview-schedule.entity';
import { OfferStatus } from './entities/job-offer.entity';

/**
 * ATS pipeline: job posting lifecycle, application intake, and the applicant
 * status transitions driven by interview/offer events, plus the funnel rollup.
 */
describe('AtsService', () => {
  let service: AtsService;
  let jobRepo: any, applicantRepo: any, interviewRepo: any, offerRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    jobRepo = mockRepo(); applicantRepo = mockRepo(); interviewRepo = mockRepo(); offerRepo = mockRepo();
    service = new AtsService(jobRepo, applicantRepo, interviewRepo, offerRepo);
  });

  it('createJobPosting starts DRAFT; publish/close stamp timestamps', async () => {
    const job = await service.createJobPosting('t1', 'u1', { title: 'Dev' } as any);
    expect(job.status).toBe(JobStatus.DRAFT);

    jobRepo.findOne.mockResolvedValue({ id: 'j1', tenantId: 't1', status: JobStatus.DRAFT });
    const pub = await service.publishJob('t1', 'j1');
    expect(pub.status).toBe(JobStatus.PUBLISHED);
    expect(pub.publishedAt).toBeInstanceOf(Date);

    jobRepo.findOne.mockResolvedValue({ id: 'j1', tenantId: 't1', status: JobStatus.PUBLISHED });
    const closed = await service.closeJob('t1', 'j1');
    expect(closed.status).toBe(JobStatus.CLOSED);
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it('updateJobPosting strips protected fields (status, createdById, tenantId)', async () => {
    jobRepo.findOne.mockResolvedValue({ id: 'j1', tenantId: 't1', status: JobStatus.DRAFT, createdById: 'u1', title: 'Old' });
    const job = await service.updateJobPosting('t1', 'j1', {
      title: 'New', status: JobStatus.PUBLISHED, createdById: 'hacker', tenantId: 't2',
    });
    expect(job.title).toBe('New');
    expect(job.status).toBe(JobStatus.DRAFT);
    expect(job.createdById).toBe('u1');
    expect(job.tenantId).toBe('t1');
  });

  it('submitApplication starts the applicant at NEW with a dated application', async () => {
    const a = await service.submitApplication('t1', { jobPostingId: 'j1', firstName: 'A' } as any);
    expect(a.status).toBe(ApplicantStatus.NEW);
    expect(a.applicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('scheduleInterview moves the applicant to INTERVIEW_SCHEDULED', async () => {
    const i = await service.scheduleInterview('t1', {
      applicantId: 'a1', jobPostingId: 'j1', scheduledAt: '2026-07-10T10:00:00Z',
    } as any);
    expect(i.status).toBe(InterviewStatus.SCHEDULED);
    expect(applicantRepo.update).toHaveBeenCalledWith(
      { id: 'a1', tenantId: 't1' }, { status: ApplicantStatus.INTERVIEW_SCHEDULED });
  });

  it('recordInterviewFeedback completes the interview and advances the applicant', async () => {
    interviewRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', applicantId: 'a1', status: InterviewStatus.SCHEDULED });
    const i = await service.recordInterviewFeedback('t1', 'i1', { feedback: 'strong', rating: 4 } as any);
    expect(i.status).toBe(InterviewStatus.COMPLETED);
    expect(applicantRepo.update).toHaveBeenCalledWith(
      { id: 'a1', tenantId: 't1' }, { status: ApplicantStatus.INTERVIEW_DONE });
  });

  it('offer flow drives applicant status through OFFER_MADE → ACCEPTED/DECLINED', async () => {
    await service.makeOffer('t1', { applicantId: 'a1', jobPostingId: 'j1' } as any);
    expect(applicantRepo.update).toHaveBeenCalledWith(
      { id: 'a1', tenantId: 't1' }, { status: ApplicantStatus.OFFER_MADE });

    offerRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', applicantId: 'a1', status: OfferStatus.DRAFTED });
    const acc = await service.acceptOffer('t1', 'o1');
    expect(acc.status).toBe(OfferStatus.ACCEPTED);
    expect(applicantRepo.update).toHaveBeenLastCalledWith(
      { id: 'a1', tenantId: 't1' }, { status: ApplicantStatus.OFFER_ACCEPTED });

    offerRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', applicantId: 'a1', status: OfferStatus.DRAFTED });
    const dec = await service.declineOffer('t1', 'o1');
    expect(dec.status).toBe(OfferStatus.DECLINED);
  });

  it('getHiringFunnel aggregates applicant counts by status', async () => {
    applicantRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { status: 'NEW', count: '4' }, { status: 'SHORTLISTED', count: '2' },
      ]),
    });
    expect(await service.getHiringFunnel('t1', 'j1')).toEqual({ NEW: 4, SHORTLISTED: 2 });
  });

  it('lookups 404 with tenant scope', async () => {
    await expect(service.getJobPosting('t2', 'j1')).rejects.toThrow(NotFoundException);
    expect(jobRepo.findOne).toHaveBeenCalledWith({ where: { id: 'j1', tenantId: 't2' } });
  });
});
