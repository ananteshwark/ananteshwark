import { BadRequestException } from '@nestjs/common';
import { AiCareerService } from './ai-career.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('AiCareerService', () => {
  let service: AiCareerService;
  let empSkillRepo: any, reqRepo: any, skillRepo: any;

  beforeEach(() => {
    empSkillRepo = mockRepo(); reqRepo = mockRepo(); skillRepo = mockRepo();
    // No client injected and no ANTHROPIC_API_KEY → LLM disabled, template fallbacks.
    service = new AiCareerService(empSkillRepo, reqRepo, skillRepo);
  });

  describe('scoreJob (pure)', () => {
    it('scores full coverage as 100 with no gaps', () => {
      const have = new Map([['s1', 4], ['s2', 3]]);
      const res = AiCareerService.scoreJob(have, [
        { skillId: 's1', requiredProficiency: 3, isMandatory: true },
        { skillId: 's2', requiredProficiency: 3, isMandatory: false },
      ]);
      expect(res.score).toBe(100);
      expect(res.gaps).toHaveLength(0);
      expect(res.blockedByMandatory).toBe(false);
    });

    it('weights by required proficiency and flags a mandatory block', () => {
      const have = new Map([['s1', 1]]); // has s1 low, missing s2 entirely
      const res = AiCareerService.scoreJob(have, [
        { skillId: 's1', requiredProficiency: 4, isMandatory: false },
        { skillId: 's2', requiredProficiency: 5, isMandatory: true },
      ]);
      // weight 4+5=9; earned 4*(1/4)=1 + 0 = 1 → 11%
      expect(res.score).toBe(11);
      expect(res.blockedByMandatory).toBe(true);
      expect(res.gaps.map((g) => g.skillId)).toEqual(expect.arrayContaining(['s1', 's2']));
    });

    it('handles a job with no requirements', () => {
      expect(AiCareerService.scoreJob(new Map(), [])).toMatchObject({ score: 0, matched: 0 });
    });
  });

  describe('clustering (pure)', () => {
    it('groups roles with overlapping skills and separates disjoint ones', () => {
      const clusters = AiCareerService.clusterBySkills([
        { id: 'r1', skillIds: ['a', 'b', 'c'] },
        { id: 'r2', skillIds: ['a', 'b', 'd'] }, // jaccard w/ r1 = 2/4 = 0.5
        { id: 'r3', skillIds: ['x', 'y', 'z'] },
      ], 0.4);
      const r1cluster = clusters.find((c) => c.members.includes('r1'))!;
      expect(r1cluster.members).toEqual(expect.arrayContaining(['r1', 'r2']));
      expect(clusters.find((c) => c.members.includes('r3'))!.members).toEqual(['r3']);
    });

    it('computes jaccard similarity', () => {
      expect(AiCareerService.jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
      expect(AiCareerService.jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    });
  });

  describe('matchInternalJobs', () => {
    it('ranks jobs by fit and drops mandatory-blocked ones by default', async () => {
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }, { skillId: 's2', proficiency: 4 }]);
      reqRepo.find.mockResolvedValue([
        { jobId: 'jobA', skillId: 's1', requiredProficiency: 3, isMandatory: true },
        { jobId: 'jobA', skillId: 's2', requiredProficiency: 3, isMandatory: true },
        { jobId: 'jobB', skillId: 's1', requiredProficiency: 3, isMandatory: true },
        { jobId: 'jobB', skillId: 's3', requiredProficiency: 5, isMandatory: true }, // blocks jobB
      ]);
      const matches = await service.matchInternalJobs('t1', 'e1');
      expect(matches.map((m) => m.jobId)).toEqual(['jobA']);
      expect(matches[0].score).toBe(100);
    });

    it('includes blocked jobs when asked', async () => {
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }]);
      reqRepo.find.mockResolvedValue([{ jobId: 'jobB', skillId: 's3', requiredProficiency: 5, isMandatory: true }]);
      const matches = await service.matchInternalJobs('t1', 'e1', { includeBlocked: true });
      expect(matches).toHaveLength(1);
      expect(matches[0].blockedByMandatory).toBe(true);
    });
  });

  describe('exploreRoleFit', () => {
    it('resolves strengths and gaps to skill names', async () => {
      reqRepo.find.mockResolvedValue([
        { skillId: 's1', requiredProficiency: 3, isMandatory: true },
        { skillId: 's2', requiredProficiency: 4, isMandatory: false },
      ]);
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }, { skillId: 's2', proficiency: 1 }]);
      skillRepo.find.mockResolvedValue([{ id: 's1', name: 'SQL' }, { id: 's2', name: 'Leadership' }]);
      const fit = await service.exploreRoleFit('t1', 'e1', 'jobA');
      expect(fit.strengths).toEqual(['SQL']);
      expect(fit.gaps).toEqual([{ skillId: 's2', skillName: 'Leadership', requiredProficiency: 4, have: 1 }]);
    });

    it('throws when the job has no requirements', async () => {
      reqRepo.find.mockResolvedValue([]);
      await expect(service.exploreRoleFit('t1', 'e1', 'jobX')).rejects.toThrow(BadRequestException);
    });
  });

  describe('careerReflection', () => {
    it('falls back to a deterministic template without an LLM key', async () => {
      expect(service.llmEnabled).toBe(false);
      const r = await service.careerReflection({ employeeName: 'Ann', currentRole: 'Engineer', topSkills: ['SQL', 'Python', 'Leadership'], aspirations: 'Tech lead' });
      expect(r.source).toBe('template');
      expect(r.suggestedFocus).toEqual(['SQL', 'Python', 'Leadership']);
      expect(r.reflection).toContain('Ann');
      expect(r.reflection).toContain('Tech lead');
    });
  });
});
