import { NotFoundException } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { ReviewCycleStatus } from './entities/review-cycle.entity';
import { FormType, FormStatus } from './entities/review-form.entity';
import { CalibrationStatus } from './entities/calibration-session.entity';

/**
 * Performance reviews: launching a cycle creates self-review forms and moves
 * the cycle to SELF_REVIEW; submissions stamp status/timestamps; calibration
 * progresses PLANNED → IN_PROGRESS → COMPLETED; summary merges all ratings.
 */
describe('PerformanceService', () => {
  let service: PerformanceService;
  let cycleRepo: any, formRepo: any, calibrationRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  });

  beforeEach(() => {
    cycleRepo = mockRepo(); formRepo = mockRepo(); calibrationRepo = mockRepo();
    service = new PerformanceService(cycleRepo, formRepo, calibrationRepo);
  });

  it('launchReviews creates one SELF form per employee and advances the cycle', async () => {
    cycleRepo.findOne.mockResolvedValue({ id: 'cy1', tenantId: 't1' });
    const forms = await service.launchReviews('t1', 'cy1', { employeeIds: ['e1', 'e2'] } as any);
    expect(forms).toHaveLength(2);
    expect(formRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'e1', reviewerId: 'e1', type: FormType.SELF, status: FormStatus.PENDING,
    }));
    expect(cycleRepo.update).toHaveBeenCalledWith(
      { id: 'cy1', tenantId: 't1' }, { status: ReviewCycleStatus.SELF_REVIEW });
  });

  it('launchReviews 404s on an unknown cycle', async () => {
    await expect(service.launchReviews('t1', 'ghost', { employeeIds: ['e1'] } as any)).rejects.toThrow(NotFoundException);
  });

  it('submitReview stores responses, rating and stamps SUBMITTED + submittedAt', async () => {
    formRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FormStatus.PENDING });
    const f = await service.submitReview('t1', 'f1', { responses: { q1: 'good' }, overallRating: 4 } as any);
    expect(f.status).toBe(FormStatus.SUBMITTED);
    expect(f.overallRating).toBe(4);
    expect(f.submittedAt).toBeInstanceOf(Date);
  });

  it('calibration progresses PLANNED → IN_PROGRESS → COMPLETED', async () => {
    const s = await service.createCalibrationSession('t1', { name: 'Q2' } as any);
    expect(s.status).toBe(CalibrationStatus.PLANNED);

    calibrationRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CalibrationStatus.PLANNED, ratings: {}, recommendations: {} });
    const rec = await service.recordCalibration('t1', 'c1', { ratings: { e1: 4 } } as any);
    expect(rec.status).toBe(CalibrationStatus.IN_PROGRESS);
    expect(rec.ratings).toEqual({ e1: 4 });

    calibrationRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CalibrationStatus.IN_PROGRESS });
    const done = await service.completeCalibration('t1', 'c1');
    expect(done.status).toBe(CalibrationStatus.COMPLETED);
  });

  it('getReviewSummary merges self, manager and calibrated ratings', async () => {
    formRepo.find.mockResolvedValue([
      { type: FormType.SELF, overallRating: 3 },
      { type: FormType.MANAGER, overallRating: 4 },
    ]);
    calibrationRepo.findOne.mockResolvedValue({ ratings: { e1: 5 }, recommendations: { e1: 'promote' } });
    const s = await service.getReviewSummary('t1', 'cy1', 'e1');
    expect(s).toEqual({ selfRating: 3, managerRating: 4, calibratedRating: 5, recommendation: 'promote' });
  });
});
