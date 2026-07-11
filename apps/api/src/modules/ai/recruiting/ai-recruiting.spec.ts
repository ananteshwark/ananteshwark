import { BadRequestException } from '@nestjs/common';
import { AiRecruitingService, TimeWindow } from './ai-recruiting.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  findOne: jest.fn().mockResolvedValue(null),
});

const W = (start: string, end: string): TimeWindow => ({ start, end });

describe('AiRecruitingService', () => {
  let service: AiRecruitingService;
  let usageRepo: any;

  beforeEach(() => {
    usageRepo = mockRepo();
    service = new AiRecruitingService(usageRepo); // no LLM client
  });

  describe('CV parsing (metered)', () => {
    it('is unavailable without an LLM key and does not consume the meter', async () => {
      expect(service.cvParseEnabled).toBe(false);
      const res = await service.parseCv('t1', '2026-07', { text: 'Jane Doe, engineer' });
      expect(res.available).toBe(false);
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('reports usage vs quota', async () => {
      usageRepo.findOne.mockResolvedValue({ count: 10 });
      expect(await service.cvParseUsage('t1', '2026-07')).toMatchObject({ count: 10, quota: 500, remaining: 490 });
    });
  });

  describe('interval maths (pure)', () => {
    it('intersects overlapping windows', () => {
      const res = AiRecruitingService.intersect(
        [W('2026-07-06T09:00:00Z', '2026-07-06T12:00:00Z')],
        [W('2026-07-06T11:00:00Z', '2026-07-06T15:00:00Z')],
      );
      expect(res).toEqual([W('2026-07-06T11:00:00.000Z', '2026-07-06T12:00:00.000Z')]);
    });

    it('subtracts a busy window, splitting the free window', () => {
      const res = AiRecruitingService.subtract(
        [W('2026-07-06T09:00:00Z', '2026-07-06T17:00:00Z')],
        [W('2026-07-06T12:00:00Z', '2026-07-06T13:00:00Z')],
      );
      expect(res).toEqual([
        W('2026-07-06T09:00:00.000Z', '2026-07-06T12:00:00.000Z'),
        W('2026-07-06T13:00:00.000Z', '2026-07-06T17:00:00.000Z'),
      ]);
    });

    it('merges adjacent windows', () => {
      const res = AiRecruitingService.merge([
        W('2026-07-06T09:00:00Z', '2026-07-06T10:00:00Z'),
        W('2026-07-06T10:00:00Z', '2026-07-06T11:00:00Z'),
      ]);
      expect(res).toEqual([W('2026-07-06T09:00:00.000Z', '2026-07-06T11:00:00.000Z')]);
    });

    it('enumerates fixed-duration slots at the step', () => {
      const slots = AiRecruitingService.enumerateSlots([W('2026-07-06T09:00:00Z', '2026-07-06T10:30:00Z')], 60, 30, 10);
      expect(slots.map((s) => s.start)).toEqual(['2026-07-06T09:00:00.000Z', '2026-07-06T09:30:00.000Z']);
    });
  });

  describe('proposeSlots', () => {
    it('finds slots where the whole panel is free and the candidate is available', () => {
      const input = {
        interviewers: [
          { id: 'i1', free: [W('2026-07-06T09:00:00Z', '2026-07-06T12:00:00Z')] },
          { id: 'i2', free: [W('2026-07-06T10:00:00Z', '2026-07-06T14:00:00Z')] },
        ],
        panel: ['i1', 'i2'],
        candidateBusy: [W('2026-07-06T10:30:00Z', '2026-07-06T11:00:00Z')],
        durationMinutes: 60, stepMinutes: 30, limit: 5,
      };
      const { slots } = service.proposeSlots(input);
      // common free = 10:00–12:00, minus 10:30–11:00 → 11:00–12:00 fits one 60m slot
      expect(slots.map((s) => s.start)).toEqual(['2026-07-06T11:00:00.000Z']);
    });

    it('returns no slots when an interviewer has no availability', () => {
      const { slots } = service.proposeSlots({
        interviewers: [{ id: 'i1', free: [W('2026-07-06T09:00:00Z', '2026-07-06T12:00:00Z')] }, { id: 'i2', free: [] }],
        panel: ['i1', 'i2'], durationMinutes: 30,
      });
      expect(slots).toEqual([]);
    });

    it('rejects a missing panel or bad duration', () => {
      expect(() => service.proposeSlots({ interviewers: [], panel: [], durationMinutes: 30 })).toThrow(BadRequestException);
      expect(() => service.proposeSlots({ interviewers: [{ id: 'i1', free: [] }], panel: ['i1'], durationMinutes: 0 })).toThrow(BadRequestException);
    });
  });
});
