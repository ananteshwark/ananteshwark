import { BadRequestException } from '@nestjs/common';
import { LearningEcosystemService } from './learning-ecosystem.service';
import { MeetingAdapter } from './meeting.adapter';
import { LearningProviderType, TrainingMode, SessionStatus } from './entities/learning-ecosystem.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('LearningEcosystemService', () => {
  let service: LearningEcosystemService;
  let providerRepo: any, xapiRepo: any, sessionRepo: any, meeting: MeetingAdapter, automation: any;

  beforeEach(() => {
    providerRepo = mockRepo(); xapiRepo = mockRepo(); sessionRepo = mockRepo();
    meeting = new MeetingAdapter();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new LearningEcosystemService(providerRepo, xapiRepo, sessionRepo, meeting, automation);
  });

  describe('xAPI normalize (pure)', () => {
    it('normalizes verb IRIs, mbox and object id', () => {
      const n = LearningEcosystemService.normalize({
        id: 'stmt-1',
        actor: { mbox: 'mailto:Ann@Example.com' },
        verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
        object: { id: 'course/123' },
        result: { score: { scaled: 0.9 } },
      });
      expect(n).toMatchObject({ rawId: 'stmt-1', actorEmail: 'ann@example.com', verb: 'completed', objectId: 'course/123' });
    });

    it('falls back to experienced for an unknown verb', () => {
      expect(LearningEcosystemService.normalize({ id: 'x', actor: { mbox: 'mailto:a@b.com' }, verb: { id: 'weird' }, object: { id: 'o' } }).verb).toBe('weird');
    });
  });

  describe('ingestStatement', () => {
    it('ingests a completion and emits learning.xapi_completed', async () => {
      xapiRepo.findOne.mockResolvedValue(null);
      const { statement, duplicate } = await service.ingestStatement('t1', {
        id: 's1', actor: { mbox: 'mailto:a@b.com' }, verb: { id: 'http://adlnet.gov/expapi/verbs/completed' }, object: { id: 'c1' }, result: { score: { scaled: 0.8 } },
      });
      expect(duplicate).toBe(false);
      expect(statement.verb).toBe('completed');
      expect(automation.emit).toHaveBeenCalledWith('t1', 'learning.xapi_completed', expect.objectContaining({ objectId: 'c1', score: 0.8 }));
    });

    it('dedupes by statement id', async () => {
      xapiRepo.findOne.mockResolvedValue({ id: 'existing', rawId: 's1' });
      const { duplicate } = await service.ingestStatement('t1', { id: 's1', actor: { mbox: 'mailto:a@b.com' }, verb: { id: 'completed' }, object: { id: 'c1' } });
      expect(duplicate).toBe(true);
    });

    it('does not emit for a non-completion verb', async () => {
      xapiRepo.findOne.mockResolvedValue(null);
      await service.ingestStatement('t1', { id: 's2', actor: { mbox: 'mailto:a@b.com' }, verb: { id: 'http://adlnet.gov/expapi/verbs/attempted' }, object: { id: 'c1' } });
      expect(automation.emit).not.toHaveBeenCalled();
    });

    it('rejects a statement missing id/actor/object', async () => {
      await expect(service.ingestStatement('t1', { verb: { id: 'completed' } })).rejects.toThrow(BadRequestException);
    });
  });

  describe('sessions', () => {
    it('creates an ILT session without touching the meeting seam', async () => {
      const s = await service.createSession('t1', { title: 'Safety 101', mode: TrainingMode.ILT, startAt: '2026-07-11T09:00:00Z', endAt: '2026-07-11T11:00:00Z', location: 'Room A', capacity: 20 });
      expect(s).toMatchObject({ mode: TrainingMode.ILT, joinUrl: null, status: SessionStatus.SCHEDULED });
    });

    it('provisions a VILT meeting via the seam (no join url when not wired)', async () => {
      providerRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', type: LearningProviderType.MEETING, provider: 'zoom', config: {} });
      const s = await service.createSession('t1', { title: 'Leadership', mode: TrainingMode.VILT, meetingProviderId: 'p1', startAt: '2026-07-11T09:00:00Z', endAt: '2026-07-11T10:00:00Z' });
      expect(s.mode).toBe(TrainingMode.VILT);
      expect(s.joinUrl).toBeNull();
    });

    it('rejects an end before start', async () => {
      await expect(service.createSession('t1', { title: 'X', startAt: '2026-07-11T10:00:00Z', endAt: '2026-07-11T09:00:00Z' })).rejects.toThrow(BadRequestException);
    });

    it('enforces capacity on enrolment', async () => {
      sessionRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SessionStatus.SCHEDULED, capacity: 1, enrolledCount: 1 });
      await expect(service.enroll('t1', 's1')).rejects.toThrow(BadRequestException);
    });

    it('increments enrolment when space remains', async () => {
      sessionRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SessionStatus.SCHEDULED, capacity: 2, enrolledCount: 0 });
      const s = await service.enroll('t1', 's1');
      expect(s.enrolledCount).toBe(1);
    });
  });
});
