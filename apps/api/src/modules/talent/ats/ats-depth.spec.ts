import { BadRequestException } from '@nestjs/common';
import { AtsService } from './ats.service';
import { JobStatus } from './entities/job-posting.entity';
import { ApplicantStatus } from './entities/applicant.entity';
import { OfferStatus } from './entities/job-offer.entity';
import { ReferralStatus } from './entities/referral.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: `gen-${Math.random().toString(36).slice(2, 6)}`, ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  update: jest.fn(),
});

describe('AtsService — recruitment quick wins', () => {
  let service: AtsService;
  let jobRepo: any, applicantRepo: any, interviewRepo: any, offerRepo: any, referralRepo: any;

  beforeEach(() => {
    jobRepo = mockRepo(); applicantRepo = mockRepo(); interviewRepo = mockRepo();
    offerRepo = mockRepo(); referralRepo = mockRepo();
    service = new AtsService(jobRepo, applicantRepo, interviewRepo, offerRepo, referralRepo);
  });

  describe('structured evaluation form', () => {
    it('stores per-criterion scores and derives an average rating', async () => {
      interviewRepo.findOne.mockResolvedValue({ id: 'iv1', tenantId: 't1', applicantId: 'a1' });
      const saved = await service.recordInterviewFeedback('t1', 'iv1', {
        evaluationScores: { communication: 4, technical: 5, culture: 3 },
      } as any);
      expect(saved.evaluationScores).toEqual({ communication: 4, technical: 5, culture: 3 });
      expect(saved.rating).toBe(4); // round((4+5+3)/3)
    });

    it('rejects out-of-range criterion scores', async () => {
      interviewRepo.findOne.mockResolvedValue({ id: 'iv1', tenantId: 't1', applicantId: 'a1' });
      await expect(service.recordInterviewFeedback('t1', 'iv1', {
        evaluationScores: { technical: 9 },
      } as any)).rejects.toThrow('between 1 and 5');
    });
  });

  describe('internal job postings (IJP)', () => {
    it('lists only published internal-only postings', async () => {
      await service.listInternalPostings('t1');
      expect(jobRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: 't1', status: JobStatus.PUBLISHED, internalOnly: true },
      }));
    });
  });

  describe('referrals', () => {
    it('creates an application and a referral carrying the posting bonus', async () => {
      jobRepo.findOne.mockResolvedValue({ id: 'job1', tenantId: 't1', referralBonus: 25000 });
      applicantRepo.save.mockResolvedValue({ id: 'app-9' });
      const referral = await service.submitReferral('t1', { userId: 'emp1', name: 'Asha' }, {
        jobPostingId: 'job1', candidateName: 'Ravi Kumar', candidateEmail: 'ravi@example.com',
      });
      expect(applicantRepo.save).toHaveBeenCalled();
      expect(referral).toMatchObject({
        referrerUserId: 'emp1', candidateName: 'Ravi Kumar', applicantId: 'app-9',
        bonusAmount: 25000, status: ReferralStatus.SUBMITTED,
      });
    });

    it('accepting an offer marks the referral HIRED', async () => {
      offerRepo.findOne.mockResolvedValue({ id: 'off1', tenantId: 't1', applicantId: 'app-9', status: OfferStatus.DRAFTED });
      referralRepo.findOne.mockResolvedValue({ id: 'ref1', tenantId: 't1', applicantId: 'app-9', status: ReferralStatus.SUBMITTED });
      await service.acceptOffer('t1', 'off1');
      const saved = referralRepo.save.mock.calls[0][0];
      expect(saved.status).toBe(ReferralStatus.HIRED);
    });

    it('requires candidate name and email', async () => {
      jobRepo.findOne.mockResolvedValue({ id: 'job1', tenantId: 't1', referralBonus: 0 });
      await expect(service.submitReferral('t1', { userId: 'e1', name: 'X' }, {
        jobPostingId: 'job1', candidateName: '', candidateEmail: '',
      })).rejects.toThrow('candidateName and candidateEmail');
    });
  });

  describe('bulk offers', () => {
    it('creates one offer per applicant and moves them to OFFER_MADE', async () => {
      const result = await service.makeBulkOffers('t1', {
        jobPostingId: 'job1', joiningDate: '2026-09-01', offerDate: '2026-08-01', validUntil: '2026-08-15',
        offers: [
          { applicantId: 'a1', offeredSalary: 1_200_000 },
          { applicantId: 'a2', offeredSalary: 1_000_000 },
        ],
      });
      expect(result.created).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(applicantRepo.update).toHaveBeenCalledWith({ id: 'a1', tenantId: 't1' }, { status: ApplicantStatus.OFFER_MADE });
    });

    it('collects per-applicant errors without aborting the batch', async () => {
      offerRepo.save
        .mockResolvedValueOnce({ id: 'o1' })
        .mockRejectedValueOnce(new Error('duplicate offer'));
      const result = await service.makeBulkOffers('t1', {
        jobPostingId: 'job1', joiningDate: '2026-09-01', offerDate: '2026-08-01', validUntil: '2026-08-15',
        offers: [{ applicantId: 'a1', offeredSalary: 100 }, { applicantId: 'a2', offeredSalary: 200 }],
      });
      expect(result.created).toHaveLength(1);
      expect(result.errors).toEqual([{ applicantId: 'a2', error: 'duplicate offer' }]);
    });

    it('rejects empty or invalid offer lists', async () => {
      await expect(service.makeBulkOffers('t1', {
        jobPostingId: 'job1', joiningDate: '2026-09-01', offerDate: '2026-08-01', validUntil: '2026-08-15', offers: [],
      })).rejects.toThrow(BadRequestException);
    });
  });
});
