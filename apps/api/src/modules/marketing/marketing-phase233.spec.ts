import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignMember, MemberStatus } from './entities/campaign-member.entity';
import { LeadScore } from './entities/lead-score.entity';
import { NurtureFlow } from './entities/nurture-flow.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('MarketingService — Phase 233-236', () => {
  let service: MarketingService;
  let campaignRepo: any, memberRepo: any, scoreRepo: any, flowRepo: any;

  beforeEach(async () => {
    campaignRepo = mockRepo(); memberRepo = mockRepo(); scoreRepo = mockRepo(); flowRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: getRepositoryToken(Campaign), useValue: campaignRepo },
        { provide: getRepositoryToken(CampaignMember), useValue: memberRepo },
        { provide: getRepositoryToken(LeadScore), useValue: scoreRepo },
        { provide: getRepositoryToken(NurtureFlow), useValue: flowRepo },
      ],
    }).compile();
    service = module.get(MarketingService);
  });

  // ─── Ph-233: campaigns ────────────────────────────────────────────

  it('addMembers — skips existing members', async () => {
    campaignRepo.findOne.mockResolvedValue({ id: 'c1', status: CampaignStatus.DRAFT });
    memberRepo.find.mockResolvedValue([{ leadId: 'l1' }]);
    memberRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.addMembers('t1', 'c1', ['l1', 'l2', 'l3']);
    expect(r.added).toBe(2);
  });

  it('sendCampaign — marks pending members SENT', async () => {
    campaignRepo.findOne.mockResolvedValue({ id: 'c1', status: CampaignStatus.SCHEDULED });
    memberRepo.find.mockResolvedValue([{ id: 'm1', status: MemberStatus.PENDING }, { id: 'm2', status: MemberStatus.PENDING }]);
    memberRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    campaignRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.sendCampaign('t1', 'c1', '2026-06-30T10:00:00Z');
    expect(r.sent).toBe(2);
  });

  it('sendCampaign — rejects already-sent', async () => {
    campaignRepo.findOne.mockResolvedValue({ id: 'c1', status: CampaignStatus.SENT });
    await expect(service.sendCampaign('t1', 'c1', '2026-06-30T10:00:00Z')).rejects.toThrow(BadRequestException);
  });

  it('campaignStats — computes open and click rates', async () => {
    memberRepo.find.mockResolvedValue([
      { status: MemberStatus.SENT }, { status: MemberStatus.OPENED }, { status: MemberStatus.CLICKED }, { status: MemberStatus.CONVERTED },
    ]);
    const r = await service.campaignStats('t1', 'c1');
    expect(r.sent).toBe(4);
    expect(r.opened).toBe(3); // opened + clicked + converted
    expect(r.clicked).toBe(2); // clicked + converted
    expect(r.openRate).toBe(75);
  });

  // ─── Ph-234: lead scoring ─────────────────────────────────────────

  it('recordBehavior — accumulates points and grades', async () => {
    scoreRepo.findOne.mockResolvedValue(null);
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const s = await service.recordBehavior('t1', 'l1', 'FORM_FILL', '2026-06-01T00:00:00Z');
    expect(s.score).toBe(20);
    expect(s.grade).toBe('C');
  });

  it('recordBehavior — negative behavior floors at 0', async () => {
    scoreRepo.findOne.mockResolvedValue({ leadId: 'l1', score: 10, grade: 'D', behaviors: [] });
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const s = await service.recordBehavior('t1', 'l1', 'UNSUBSCRIBE', '2026-06-01T00:00:00Z');
    expect(s.score).toBe(0);
  });

  it('recordBehavior — rejects unknown behavior', async () => {
    await expect(service.recordBehavior('t1', 'l1', 'WAT', '2026-06-01T00:00:00Z')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-235: nurture flows ────────────────────────────────────────

  it('triggerFlows — schedules step due dates from delayDays', async () => {
    flowRepo.find.mockResolvedValue([
      { id: 'f1', name: 'Welcome', steps: [{ order: 1, delayDays: 0, action: 'SEND_EMAIL' }, { order: 2, delayDays: 3, action: 'SEND_EMAIL' }] },
    ]);
    const r = await service.triggerFlows('t1', 'FORM_FILL', 'l1', '2026-06-01');
    expect(r.triggeredFlows).toBe(1);
    expect(r.scheduled[0].steps[0].dueDate).toBe('2026-06-01');
    expect(r.scheduled[0].steps[1].dueDate).toBe('2026-06-04');
  });

  it('createFlow — requires steps', async () => {
    await expect(service.createFlow('t1', { name: 'X', triggerBehavior: 'FORM_FILL', steps: [] })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-236: attribution ──────────────────────────────────────────

  it('recordConversion — sets converted value and status', async () => {
    memberRepo.findOne.mockResolvedValue({ id: 'm1', status: MemberStatus.CLICKED });
    memberRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const m = await service.recordConversion('t1', 'm1', 'opp1', 5000);
    expect(m.status).toBe(MemberStatus.CONVERTED);
    expect(m.convertedValue).toBe(5000);
  });

  it('campaignRoi — computes ROI from attributed revenue vs cost', async () => {
    campaignRepo.findOne.mockResolvedValue({ id: 'c1', name: 'Q2 Push', cost: 1000 });
    memberRepo.find.mockResolvedValue([
      { status: MemberStatus.CONVERTED, convertedValue: 4000 },
      { status: MemberStatus.CONVERTED, convertedValue: 1000 },
      { status: MemberStatus.SENT, convertedValue: 0 },
    ]);
    const r = await service.campaignRoi('t1', 'c1');
    expect(r.revenue).toBe(5000);
    expect(r.roiPct).toBe(400); // (5000-1000)/1000*100
    expect(r.conversions).toBe(2);
  });
});
