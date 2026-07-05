import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SurveysService } from './surveys.service';
import { RecognitionService } from './recognition.service';
import { FeedService } from './feed.service';
import { SurveyStatus } from './entities/survey.entity';
import { FeedPostType } from './entities/feed.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('Engagement — surveys', () => {
  let service: SurveysService;
  let surveyRepo: any, responseRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    surveyRepo = mockRepo();
    responseRepo = mockRepo();
    automation.emit.mockClear();
    service = new SurveysService(surveyRepo, responseRepo, automation as any);
  });

  it('rejects surveys without questions and assigns question ids', async () => {
    await expect(service.createSurvey('t1', 'u1', { title: 'Empty', questions: [] } as any))
      .rejects.toThrow(BadRequestException);
    await service.createSurvey('t1', 'u1', {
      title: 'Pulse', questions: [{ text: 'Feeling good?', type: 'RATING' }],
    } as any);
    const created = surveyRepo.create.mock.calls[0][0];
    expect(created.questions[0].id).toBeTruthy();
    expect(created.status).toBe(SurveyStatus.DRAFT);
  });

  it('publish emits survey.published; only DRAFT can publish', async () => {
    surveyRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', title: 'P', type: 'PULSE', status: SurveyStatus.DRAFT });
    await service.activate('t1', 's1');
    expect(automation.emit).toHaveBeenCalledWith('t1', 'survey.published', expect.objectContaining({ surveyId: 's1' }));
    surveyRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SurveyStatus.CLOSED });
    await expect(service.activate('t1', 's1')).rejects.toThrow(BadRequestException);
  });

  it('blocks double submission via respondent hash and hides identity on anonymous surveys', async () => {
    const survey = {
      id: 's1', tenantId: 't1', status: SurveyStatus.ACTIVE, anonymous: true,
      questions: [{ id: 'q1', text: 'Score?', type: 'SCALE_10' }],
    };
    surveyRepo.findOne.mockResolvedValue(survey);
    await service.submitResponse('t1', 's1', 'user-9', { q1: 8 });
    const stored = responseRepo.create.mock.calls[0][0];
    expect(stored.respondentUserId).toBeNull();          // anonymity preserved
    expect(stored.respondentKey).toHaveLength(64);       // but dedupe key exists
    responseRepo.findOne.mockResolvedValue({ id: 'r1' }); // same key already present
    await expect(service.submitResponse('t1', 's1', 'user-9', { q1: 8 }))
      .rejects.toThrow('already responded');
  });

  it('requires answers for required questions', async () => {
    surveyRepo.findOne.mockResolvedValue({
      id: 's1', tenantId: 't1', status: SurveyStatus.ACTIVE, anonymous: true,
      questions: [{ id: 'q1', text: 'Must answer', type: 'TEXT' }],
    });
    await expect(service.submitResponse('t1', 's1', 'u1', {})).rejects.toThrow('Missing answers');
  });

  it('aggregates results: averages, yes%, and eNPS from a 0–10 scale', async () => {
    surveyRepo.findOne.mockResolvedValue({
      id: 's1', tenantId: 't1', title: 'eNPS', type: 'ENPS', status: SurveyStatus.CLOSED, anonymous: true,
      questions: [
        { id: 'q1', text: 'Recommend us?', type: 'SCALE_10' },
        { id: 'q2', text: 'Happy?', type: 'YES_NO' },
      ],
    });
    responseRepo.find.mockResolvedValue([
      { answers: { q1: 10, q2: true } },   // promoter
      { answers: { q1: 9, q2: true } },    // promoter
      { answers: { q1: 7, q2: false } },   // passive
      { answers: { q1: 3, q2: true } },    // detractor
    ]);
    const r = await service.results('t1', 's1');
    const q1 = r.questions.find((q: any) => q.questionId === 'q1');
    const q2 = r.questions.find((q: any) => q.questionId === 'q2');
    expect(q1.enps).toBe(25); // (2 promoters - 1 detractor) / 4 = 25
    expect(q1.average).toBe(7.25);
    expect(q2.yesPercent).toBe(75);
    expect(r.responseCount).toBe(4);
  });
});

describe('Engagement — recognition', () => {
  let service: RecognitionService;
  let badgeRepo: any, recRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    badgeRepo = mockRepo();
    recRepo = mockRepo();
    automation.emit.mockClear();
    service = new RecognitionService(badgeRepo, recRepo, automation as any);
  });

  it('gives recognition with badge snapshot + points and emits recognition.given', async () => {
    badgeRepo.findOne.mockResolvedValue({ id: 'b1', tenantId: 't1', name: 'Team Player', icon: '🤝', points: 50, isActive: true });
    await service.give('t1', { userId: 'u1', name: 'Alice' }, {
      badgeId: 'b1', toEmployeeId: 'e2', toName: 'Bob', message: 'Great sprint!',
    });
    const rec = recRepo.create.mock.calls[0][0];
    expect(rec.badgeName).toBe('Team Player');
    expect(rec.points).toBe(50);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'recognition.given', expect.objectContaining({ toName: 'Bob', points: 50 }));
  });

  it('rejects inactive badges and empty messages', async () => {
    badgeRepo.findOne.mockResolvedValue({ id: 'b1', tenantId: 't1', name: 'Old', isActive: false });
    await expect(service.give('t1', { userId: 'u1', name: 'A' }, { badgeId: 'b1', toEmployeeId: 'e2', toName: 'B', message: 'x' }))
      .rejects.toThrow('no longer active');
    badgeRepo.findOne.mockResolvedValue({ id: 'b1', tenantId: 't1', name: 'Ok', isActive: true });
    await expect(service.give('t1', { userId: 'u1', name: 'A' }, { badgeId: 'b1', toEmployeeId: 'e2', toName: 'B', message: '  ' }))
      .rejects.toThrow('message is required');
  });

  it('leaderboard sums points per employee, sorted', async () => {
    recRepo.find.mockResolvedValue([
      { toEmployeeId: 'e1', toName: 'Alice', points: 50, createdAt: new Date() },
      { toEmployeeId: 'e2', toName: 'Bob', points: 30, createdAt: new Date() },
      { toEmployeeId: 'e1', toName: 'Alice', points: 20, createdAt: new Date() },
    ]);
    const board = await service.leaderboard('t1');
    expect(board[0]).toMatchObject({ employeeId: 'e1', points: 70, count: 2 });
    expect(board[1]).toMatchObject({ employeeId: 'e2', points: 30 });
  });
});

describe('Engagement — company feed', () => {
  let service: FeedService;
  let postRepo: any, commentRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    postRepo = mockRepo();
    commentRepo = mockRepo();
    automation.emit.mockClear();
    service = new FeedService(postRepo, commentRepo, automation as any);
  });

  it('polls need two options; votes are one-per-user with overwrite', async () => {
    await expect(service.createPost('t1', { userId: 'u1', name: 'A' }, {
      type: FeedPostType.POLL, body: 'Pick one', pollOptions: [{ id: '', text: 'Only' }],
    })).rejects.toThrow('at least two options');

    const post: any = {
      id: 'p1', tenantId: 't1', type: FeedPostType.POLL,
      pollOptions: [{ id: 'o1', text: 'Tea' }, { id: 'o2', text: 'Coffee' }],
      pollVotes: { u9: 'o1' },
    };
    postRepo.findOne.mockResolvedValue(post);
    const r1 = await service.vote('t1', 'p1', 'u1', 'o2');
    expect(r1.totalVotes).toBe(2);
    const r2 = await service.vote('t1', 'p1', 'u1', 'o1'); // revote overwrites
    expect(r2.options.find((o: any) => o.id === 'o1')!.votes).toBe(2);
    expect(r2.totalVotes).toBe(2);
    await expect(service.vote('t1', 'p1', 'u1', 'nope')).rejects.toThrow('Unknown poll option');
  });

  it('announcements emit feed.announcement_posted and honor pinning', async () => {
    await service.createAnnouncement('t1', { userId: 'hr1', name: 'HR' }, {
      title: 'Holiday', body: 'Office closed Friday', pinned: true,
    });
    expect(postRepo.create.mock.calls[0][0]).toMatchObject({ type: FeedPostType.ANNOUNCEMENT, pinned: true });
    expect(automation.emit).toHaveBeenCalledWith('t1', 'feed.announcement_posted', expect.objectContaining({ title: 'Holiday' }));
  });

  it('likes toggle on/off and comments bump commentCount', async () => {
    const post: any = { id: 'p1', tenantId: 't1', likedBy: [], commentCount: 0 };
    postRepo.findOne.mockResolvedValue(post);
    expect((await service.toggleLike('t1', 'p1', 'u1'))).toEqual({ liked: true, likeCount: 1 });
    expect((await service.toggleLike('t1', 'p1', 'u1'))).toEqual({ liked: false, likeCount: 0 });
    await service.addComment('t1', 'p1', { userId: 'u2', name: 'B' }, 'Nice!');
    expect(post.commentCount).toBe(1);
  });

  it('non-moderators can only delete their own posts', async () => {
    postRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', authorUserId: 'author-1' });
    await expect(service.deletePost('t1', 'p1', 'someone-else', false)).rejects.toThrow(ForbiddenException);
    await service.deletePost('t1', 'p1', 'someone-else', true); // moderator OK
    expect(postRepo.delete).toHaveBeenCalledWith({ id: 'p1', tenantId: 't1' });
  });
});
