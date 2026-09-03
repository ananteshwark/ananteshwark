import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IdpService } from './idp.service';
import { IdpStatus, IdpItemStatus, IdpItemType } from './idp.entity';
import { FeedbackService } from '../feedback/feedback.service';
import { FeedbackVisibility, FeedbackRequestStatus } from '../feedback/feedback.entity';
import { GoalsService } from '../goals/goals.service';
import { OwnerType } from '../goals/entities/objective.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: `gen-${Math.random().toString(36).slice(2, 6)}`, ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  update: jest.fn(),
});

describe('IdpService — development plans', () => {
  let service: IdpService;
  let planRepo: any, itemRepo: any;

  beforeEach(() => {
    planRepo = mockRepo(); itemRepo = mockRepo();
    service = new IdpService(planRepo as any, itemRepo as any);
  });

  it('creates a DRAFT plan and computes progress from item completion', async () => {
    const plan = await service.createPlan('t1', 'mgr1', { employeeId: 'e1', title: 'Grow into tech lead' });
    expect(plan.status).toBe(IdpStatus.DRAFT);

    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: IdpStatus.ACTIVE });
    itemRepo.find.mockResolvedValue([
      { status: IdpItemStatus.DONE }, { status: IdpItemStatus.DONE },
      { status: IdpItemStatus.IN_PROGRESS }, { status: IdpItemStatus.NOT_STARTED },
    ]);
    const view = await service.getPlan('t1', 'p1');
    expect(view.progressPct).toBe(50);
  });

  it('activation requires items; completion requires no untouched items', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: IdpStatus.DRAFT });
    itemRepo.count.mockResolvedValue(0);
    await expect(service.activatePlan('t1', 'p1')).rejects.toThrow('at least one development item');

    itemRepo.count.mockResolvedValue(2);
    const activated = await service.activatePlan('t1', 'p1');
    expect(activated.status).toBe(IdpStatus.ACTIVE);

    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: IdpStatus.ACTIVE });
    itemRepo.count.mockResolvedValue(1); // one NOT_STARTED
    await expect(service.completePlan('t1', 'p1')).rejects.toThrow('have not been started');
    itemRepo.count.mockResolvedValue(0);
    const done = await service.completePlan('t1', 'p1');
    expect(done.status).toBe(IdpStatus.COMPLETED);
  });

  it('items link to courses/skills and cannot be added to closed plans', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: IdpStatus.ACTIVE });
    const item = await service.addItem('t1', 'p1', {
      itemType: IdpItemType.COURSE, title: 'System design course', courseId: 'course-9', skillId: 'skill-4',
    });
    expect(item).toMatchObject({ courseId: 'course-9', skillId: 'skill-4' });

    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: IdpStatus.COMPLETED });
    await expect(service.addItem('t1', 'p1', { title: 'X' })).rejects.toThrow('COMPLETED');
  });
});

describe('FeedbackService — continuous feedback', () => {
  let service: FeedbackService;
  let feedbackRepo: any, requestRepo: any;

  beforeEach(() => {
    feedbackRepo = mockRepo(); requestRepo = mockRepo();
    service = new FeedbackService(feedbackRepo as any, requestRepo as any);
  });

  it('gives unsolicited feedback with MANAGER visibility by default', async () => {
    const fb = await service.give('t1', { userId: 'u1', name: 'Priya' }, {
      toEmployeeId: 'e2', body: 'Great demo today',
    });
    expect(fb.visibility).toBe(FeedbackVisibility.MANAGER);
    expect(fb.kind).toBe('PRAISE');
  });

  it('request-bound feedback validates responder, subject, and open status', async () => {
    requestRepo.findOne.mockResolvedValue({
      id: 'req1', tenantId: 't1', aboutEmployeeId: 'e2',
      responderUserIds: ['u1'], status: FeedbackRequestStatus.OPEN,
    });
    const fb = await service.give('t1', { userId: 'u1', name: 'Priya' }, {
      toEmployeeId: 'e2', body: 'Handled the incident well', requestId: 'req1',
    });
    expect(fb.requestId).toBe('req1');

    await expect(service.give('t1', { userId: 'intruder', name: 'X' }, {
      toEmployeeId: 'e2', body: 'hi', requestId: 'req1',
    })).rejects.toThrow(ForbiddenException);

    requestRepo.findOne.mockResolvedValue({
      id: 'req1', tenantId: 't1', aboutEmployeeId: 'OTHER',
      responderUserIds: ['u1'], status: FeedbackRequestStatus.OPEN,
    });
    await expect(service.give('t1', { userId: 'u1', name: 'Priya' }, {
      toEmployeeId: 'e2', body: 'hi', requestId: 'req1',
    })).rejects.toThrow('does not match');
  });

  it('visibility scoping filters what each viewer sees', async () => {
    feedbackRepo.find.mockResolvedValue([
      { visibility: FeedbackVisibility.PRIVATE },
      { visibility: FeedbackVisibility.MANAGER },
      { visibility: FeedbackVisibility.PUBLIC },
    ]);
    expect((await service.listFor('t1', 'e1', 'self')).length).toBe(3);
    expect((await service.listFor('t1', 'e1', 'manager')).length).toBe(2);
    expect((await service.listFor('t1', 'e1', 'public')).length).toBe(1);
  });

  it('pending requests exclude ones the caller already answered', async () => {
    requestRepo.find.mockResolvedValue([
      { id: 'r1', responderUserIds: ['u1'], status: FeedbackRequestStatus.OPEN },
      { id: 'r2', responderUserIds: ['u1'], status: FeedbackRequestStatus.OPEN },
      { id: 'r3', responderUserIds: ['other'], status: FeedbackRequestStatus.OPEN },
    ]);
    feedbackRepo.find.mockResolvedValue([{ requestId: 'r1', fromUserId: 'u1' }]);
    const pending = await service.myPendingRequests('t1', 'u1');
    expect(pending.map((r) => r.id)).toEqual(['r2']);
  });
});

describe('GoalsService — journal, explorer, bulk', () => {
  let service: GoalsService;
  let cycleRepo: any, objectiveRepo: any, krRepo: any, journalRepo: any;

  beforeEach(() => {
    cycleRepo = mockRepo(); objectiveRepo = mockRepo(); krRepo = mockRepo(); journalRepo = mockRepo();
    service = new GoalsService(cycleRepo as any, objectiveRepo as any, krRepo as any, journalRepo as any);
  });

  it('journal entries attach to existing objectives only', async () => {
    objectiveRepo.findOne.mockResolvedValue(null);
    await expect(service.addJournalEntry('t1', 'obj-x', { userId: 'u1', name: 'P' }, 'note'))
      .rejects.toThrow('not found');
    objectiveRepo.findOne.mockResolvedValue({ id: 'obj-1' });
    const entry = await service.addJournalEntry('t1', 'obj-1', { userId: 'u1', name: 'Priya' }, 'Shipped milestone 1');
    expect(entry).toMatchObject({ objectiveId: 'obj-1', authorName: 'Priya' });
  });

  it('copyObjective clones the goal and its key results with progress reset', async () => {
    objectiveRepo.findOne.mockResolvedValue({
      id: 'src', tenantId: 't1', cycleId: 'cy1', title: 'Improve NPS', description: 'd', weight: 1,
    });
    krRepo.find.mockResolvedValue([
      { title: 'NPS >= 60', metric: 'NPS', targetValue: 60, currentValue: 55, unit: 'pts' },
    ]);
    const copy = await service.copyObjective('t1', 'src', { ownerId: 'e9' });
    expect(copy).toMatchObject({ ownerId: 'e9', progress: 0, ownerType: OwnerType.INDIVIDUAL });
    expect(krRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      objectiveId: copy.id, currentValue: 0, progress: 0, targetValue: 60,
    }));
  });

  it('bulk assignment creates one objective (plus KRs) per unique owner', async () => {
    const result = await service.bulkCreateObjectives('t1', {
      cycleId: 'cy1', title: 'Complete security training',
      ownerIds: ['e1', 'e2', 'e2', 'e3'],
      keyResults: [{ title: 'Modules done', targetValue: 5 }],
    });
    expect(result.created).toBe(3); // e2 deduplicated
    expect(objectiveRepo.save).toHaveBeenCalledTimes(3);
    expect(krRepo.save).toHaveBeenCalledTimes(3);
    await expect(service.bulkCreateObjectives('t1', { cycleId: 'cy1', title: 'X', ownerIds: [] }))
      .rejects.toThrow(BadRequestException);
  });
});
