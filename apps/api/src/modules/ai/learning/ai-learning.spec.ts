import { AiLearningService } from './ai-learning.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('AiLearningService', () => {
  let service: AiLearningService;
  let courseRepo: any, skillRepo: any, empSkillRepo: any, reqRepo: any;

  beforeEach(() => {
    courseRepo = mockRepo(); skillRepo = mockRepo(); empSkillRepo = mockRepo(); reqRepo = mockRepo();
    service = new AiLearningService(courseRepo, skillRepo, empSkillRepo, reqRepo);
  });

  describe('inferSkills (pure)', () => {
    it('infers skills mentioned across signals and scales confidence by hits', () => {
      const catalog = [{ id: 's1', name: 'Python' }, { id: 's2', name: 'Leadership' }, { id: 's3', name: 'Rust' }];
      const res = AiLearningService.inferSkills(
        ['Built a Python data pipeline', 'Python and Leadership on a cross-team project'],
        catalog,
      );
      const byId = Object.fromEntries(res.map((r) => [r.skillId, r]));
      expect(byId['s1'].hits).toBe(2);
      expect(byId['s1'].confidence).toBe(1);
      expect(byId['s2'].hits).toBe(1);
      expect(byId['s3']).toBeUndefined(); // Rust never mentioned
      expect(res[0].skillId).toBe('s1'); // sorted by confidence
    });
  });

  describe('mapCourseToSkills (pure)', () => {
    it('maps by skill tag then by title/description text', () => {
      const catalog = [{ id: 's1', name: 'Python' }, { id: 's2', name: 'Leadership' }, { id: 's3', name: 'SQL' }];
      const res = AiLearningService.mapCourseToSkills(
        { skillTags: ['Python'], title: 'Intro to Leadership', description: 'no sql here at all... actually SQL' },
        catalog,
      );
      const byId = Object.fromEntries(res.map((r) => [r.skillId, r]));
      expect(byId['s1'].via).toBe('tag');
      expect(byId['s2'].via).toBe('text');
      expect(byId['s3'].via).toBe('text');
    });
  });

  describe('rankCourses (pure)', () => {
    it('ranks title matches above description matches', () => {
      const courses = [
        { id: 'c1', title: 'Advanced SQL', description: 'x', skillTags: [] },
        { id: 'c2', title: 'Data Basics', description: 'covers sql briefly', skillTags: [] },
        { id: 'c3', title: 'Cooking', description: 'nothing', skillTags: [] },
      ];
      const res = AiLearningService.rankCourses('sql', courses);
      expect(res.map((r) => r.courseId)).toEqual(['c1', 'c2']);
    });

    it('returns nothing for a blank query', () => {
      expect(AiLearningService.rankCourses('', [{ id: 'c1', title: 'x' }])).toEqual([]);
    });
  });

  describe('recommendForJob', () => {
    it('ranks courses by how many gap skills they cover', async () => {
      reqRepo.find.mockResolvedValue([
        { skillId: 's1', requiredProficiency: 3 },
        { skillId: 's2', requiredProficiency: 3 },
      ]);
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 4 }]); // s1 met, s2 gap
      skillRepo.find.mockResolvedValue([{ id: 's2', name: 'SQL' }]);
      courseRepo.find.mockResolvedValue([
        { id: 'c1', title: 'SQL Mastery', skillTags: ['SQL'] },
        { id: 'c2', title: 'Cooking', skillTags: ['Cooking'] },
      ]);
      const res = await service.recommendForJob('t1', 'e1', 'jobA');
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ courseId: 'c1', coverage: 1 });
    });

    it('returns nothing when there are no gaps', async () => {
      reqRepo.find.mockResolvedValue([{ skillId: 's1', requiredProficiency: 2 }]);
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1', proficiency: 5 }]);
      expect(await service.recommendForJob('t1', 'e1', 'jobA')).toEqual([]);
    });
  });
});
