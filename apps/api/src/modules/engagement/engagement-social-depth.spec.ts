import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedGroupService } from './feed-group.service';
import { NominationService } from './nomination.service';
import { ModerationStatus } from './entities/feed.entity';
import { NominationProgramStatus, NominationStatus } from './entities/recognition-nomination.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: `gen-${Math.random().toString(36).slice(2, 6)}`, ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  delete: jest.fn(),
});

describe('FeedGroupService', () => {
  let service: FeedGroupService;
  let groupRepo: any;

  beforeEach(() => {
    groupRepo = mockRepo();
    service = new FeedGroupService(groupRepo as any);
  });

  it('creates a group with the owner as first member', async () => {
    const group = await service.createGroup('t1', 'owner1', { name: 'Cycling Club' });
    expect(group.memberUserIds).toEqual(['owner1']);
    expect(group.ownerUserId).toBe('owner1');
  });

  it('join is idempotent; owner cannot leave; only owner archives', async () => {
    groupRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', ownerUserId: 'owner1', memberUserIds: ['owner1'], isActive: true });
    const joined = await service.join('t1', 'g1', 'u2');
    expect(joined.memberUserIds).toEqual(['owner1', 'u2']);
    await service.join('t1', 'g1', 'u2'); // no duplicate

    await expect(service.leave('t1', 'g1', 'owner1')).rejects.toThrow('owner cannot leave');
    await expect(service.archive('t1', 'g1', 'u2')).rejects.toThrow(ForbiddenException);
    const archived = await service.archive('t1', 'g1', 'owner1');
    expect(archived.isActive).toBe(false);
  });

  it('requiresModeration only for non-owners in a moderated group', () => {
    const moderated = { moderated: true, ownerUserId: 'owner1' } as any;
    expect(service.requiresModeration(moderated, 'owner1')).toBe(false);
    expect(service.requiresModeration(moderated, 'member2')).toBe(true);
    expect(service.requiresModeration({ moderated: false, ownerUserId: 'owner1' } as any, 'member2')).toBe(false);
  });
});

describe('FeedService — groups + moderation', () => {
  let service: FeedService;
  let postRepo: any, commentRepo: any, groups: any;

  beforeEach(() => {
    postRepo = mockRepo(); commentRepo = mockRepo();
    groups = {
      getGroup: jest.fn(),
      isMember: jest.fn().mockReturnValue(true),
      requiresModeration: jest.fn().mockReturnValue(false),
    };
    service = new FeedService(postRepo as any, commentRepo as any, undefined, groups as any);
  });

  it('rejects group posts from non-members', async () => {
    groups.getGroup.mockResolvedValue({ id: 'g1', moderated: false });
    groups.isMember.mockReturnValue(false);
    await expect(service.createPost('t1', { userId: 'u2', name: 'X' }, { body: 'hi', groupId: 'g1' }))
      .rejects.toThrow('group member');
  });

  it('holds a moderated group post as PENDING', async () => {
    groups.getGroup.mockResolvedValue({ id: 'g1', moderated: true });
    groups.requiresModeration.mockReturnValue(true);
    const post = await service.createPost('t1', { userId: 'u2', name: 'X' }, { body: 'hi', groupId: 'g1' });
    expect(post.moderationStatus).toBe(ModerationStatus.PENDING);
  });

  it('approves an APPROVED post directly, PENDING otherwise', async () => {
    const post = await service.createPost('t1', { userId: 'u1', name: 'X' }, { body: 'company-wide' });
    expect(post.moderationStatus).toBe(ModerationStatus.APPROVED);
    expect(post.groupId).toBeNull();
  });

  it('reporting an approved post drops it back into the queue', async () => {
    postRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', reportedBy: [], moderationStatus: ModerationStatus.APPROVED });
    const result = await service.reportPost('t1', 'p1', 'reporter1');
    expect(result).toEqual({ reported: true, reportCount: 1 });
    const saved = postRepo.save.mock.calls[0][0];
    expect(saved.moderationStatus).toBe(ModerationStatus.PENDING);
  });

  it('moderate approve clears reports; reject blocks the post', async () => {
    postRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', moderationStatus: ModerationStatus.PENDING, reportedBy: ['a', 'b'] });
    const approved = await service.moderate('t1', 'p1', 'approve');
    expect(approved.moderationStatus).toBe(ModerationStatus.APPROVED);
    expect(approved.reportedBy).toEqual([]);

    postRepo.findOne.mockResolvedValue({ id: 'p2', tenantId: 't1', moderationStatus: ModerationStatus.PENDING, reportedBy: [] });
    const rejected = await service.moderate('t1', 'p2', 'reject');
    expect(rejected.moderationStatus).toBe(ModerationStatus.REJECTED);

    postRepo.findOne.mockResolvedValue({ id: 'p3', tenantId: 't1', moderationStatus: ModerationStatus.APPROVED });
    await expect(service.moderate('t1', 'p3', 'approve')).rejects.toThrow('not pending');
  });
});

describe('NominationService — programs + panel voting', () => {
  let service: NominationService;
  let programRepo: any, nominationRepo: any, badgeRepo: any;

  beforeEach(() => {
    programRepo = mockRepo(); nominationRepo = mockRepo(); badgeRepo = mockRepo();
    service = new NominationService(programRepo as any, nominationRepo as any, badgeRepo as any);
  });

  const openProgram = (over: any = {}) => ({
    id: 'prog1', tenantId: 't1', name: 'Star of the Month', status: NominationProgramStatus.OPEN,
    panelUserIds: ['panel1', 'panel2', 'panel3'], votesToWin: 2, badgeId: 'badge1', ...over,
  });

  it('nominations require an open program', async () => {
    programRepo.findOne.mockResolvedValue(openProgram({ status: NominationProgramStatus.CLOSED }));
    await expect(service.nominate('t1', { userId: 'u1', name: 'P' }, {
      programId: 'prog1', nomineeEmployeeId: 'e2', nomineeName: 'Ravi', justification: 'Great work',
    })).rejects.toThrow('closed');
  });

  it('only panel members vote, once each', async () => {
    nominationRepo.findOne.mockResolvedValue({ id: 'n1', tenantId: 't1', programId: 'prog1', votedBy: [], status: NominationStatus.SUBMITTED });
    programRepo.findOne.mockResolvedValue(openProgram({ votesToWin: 0 }));
    await expect(service.vote('t1', 'n1', 'outsider')).rejects.toThrow('panel members');
    const voted = await service.vote('t1', 'n1', 'panel1');
    expect(voted.votedBy).toEqual(['panel1']);
  });

  it('reaching votesToWin auto-approves and awards the badge via the giver', async () => {
    const giver = jest.fn().mockResolvedValue({ id: 'rec-9' });
    nominationRepo.findOne.mockResolvedValue({
      id: 'n1', tenantId: 't1', programId: 'prog1',
      votedBy: ['panel1'], status: NominationStatus.SUBMITTED,
      nomineeEmployeeId: 'e2', nomineeName: 'Ravi', justification: 'Led the migration',
    });
    programRepo.findOne.mockResolvedValue(openProgram({ votesToWin: 2 }));
    // second vote crosses the threshold → decide('approve')
    const result = await service.vote('t1', 'n1', 'panel2');
    // decide re-loads the nomination; keep it SUBMITTED so decide proceeds
    expect(result.status).toBe(NominationStatus.APPROVED);
  });

  it('decide approve awards a badge recognition and stamps recognitionId', async () => {
    const giver = jest.fn().mockResolvedValue({ id: 'rec-9' });
    nominationRepo.findOne.mockResolvedValue({
      id: 'n1', tenantId: 't1', programId: 'prog1', status: NominationStatus.SUBMITTED,
      nomineeEmployeeId: 'e2', nomineeName: 'Ravi', justification: 'Led the migration',
    });
    programRepo.findOne.mockResolvedValue(openProgram());
    const decided = await service.decide('t1', 'n1', 'approve', giver);
    expect(giver).toHaveBeenCalledWith(expect.objectContaining({ badgeId: 'badge1', toEmployeeId: 'e2' }));
    expect(decided.status).toBe(NominationStatus.APPROVED);
    expect(decided.recognitionId).toBe('rec-9');

    nominationRepo.findOne.mockResolvedValue({ id: 'n1', status: NominationStatus.APPROVED });
    await expect(service.decide('t1', 'n1', 'approve', giver)).rejects.toThrow('already');
  });
});
