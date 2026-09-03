import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PeopleAnalyticsService } from './people-analytics.service';
import { AnalyticsTier, StoryboardStatus } from './entities/people-analytics.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
});

describe('PeopleAnalyticsService', () => {
  let service: PeopleAnalyticsService;
  let licenseRepo: any, policyRepo: any, metricRepo: any, storyboardRepo: any, automation: any;

  beforeEach(() => {
    licenseRepo = mockRepo(); policyRepo = mockRepo(); metricRepo = mockRepo(); storyboardRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new PeopleAnalyticsService(licenseRepo, policyRepo, metricRepo, storyboardRepo, automation);
  });

  describe('licences & seat caps', () => {
    it('assigns a licence when seats are available', async () => {
      policyRepo.findOne.mockResolvedValue({ tenantId: 't1', limits: { CREATOR: 2 } });
      licenseRepo.findOne.mockResolvedValue(null);
      licenseRepo.count.mockResolvedValue(1);
      const lic = await service.assignLicense('t1', 'u1', AnalyticsTier.CREATOR, 'admin');
      expect(lic.tier).toBe(AnalyticsTier.CREATOR);
    });

    it('rejects when the tier seat cap is exhausted', async () => {
      policyRepo.findOne.mockResolvedValue({ tenantId: 't1', limits: { CREATOR: 2 } });
      licenseRepo.findOne.mockResolvedValue(null);
      licenseRepo.count.mockResolvedValue(2);
      await expect(service.assignLicense('t1', 'u1', AnalyticsTier.CREATOR)).rejects.toThrow(BadRequestException);
    });

    it('allows a same-tier re-save without consuming a new seat', async () => {
      policyRepo.findOne.mockResolvedValue({ tenantId: 't1', limits: { CREATOR: 1 } });
      licenseRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', userId: 'u1', tier: AnalyticsTier.CREATOR });
      licenseRepo.count.mockResolvedValue(1); // full, but user already holds the seat
      const lic = await service.assignLicense('t1', 'u1', AnalyticsTier.CREATOR);
      expect(lic.tier).toBe(AnalyticsTier.CREATOR);
    });
  });

  describe('metric composer (licence-gated)', () => {
    it('requires an EXPLORER+ licence to compose', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.VIEWER });
      await expect(service.createMetric('t1', 'u1', { key: 'm', name: 'M', subjectAreaCode: 'hc', measure: 'headcount' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('creates a metric for an EXPLORER', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.EXPLORER });
      metricRepo.findOne.mockResolvedValue(null);
      const m = await service.createMetric('t1', 'u1', { key: 'attrition', name: 'Attrition', subjectAreaCode: 'hc', measure: 'terminations', agg: 'count' });
      expect(m).toMatchObject({ key: 'attrition', agg: 'COUNT' });
    });

    it('rejects an invalid aggregation', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.CREATOR });
      metricRepo.findOne.mockResolvedValue(null);
      await expect(service.createMetric('t1', 'u1', { key: 'm', name: 'M', subjectAreaCode: 'hc', measure: 'x', agg: 'MEDIAN' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('computeMetric', () => {
    it('aggregates with filters and a dimension breakdown', async () => {
      metricRepo.findOne.mockResolvedValue({
        tenantId: 't1', key: 'sal', measure: 'salary', agg: 'AVG', dimension: 'dept', format: 'currency',
        filters: [{ field: 'active', op: 'eq', value: true }],
      });
      const rows = [
        { salary: 100, dept: 'Eng', active: true },
        { salary: 200, dept: 'Eng', active: true },
        { salary: 999, dept: 'Eng', active: false }, // filtered out
        { salary: 50, dept: 'Ops', active: true },
      ];
      const res = await service.computeMetric('t1', 'sal', rows);
      expect(res.value).toBe(Math.round(((100 + 200 + 50) / 3) * 100) / 100);
      expect(res.byDimension).toEqual({ Eng: 150, Ops: 50 });
      expect(res.format).toBe('currency');
    });
  });

  describe('storyboards (CREATOR-gated)', () => {
    it('requires a CREATOR licence to create', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.EXPLORER });
      await expect(service.createStoryboard('t1', 'u1', { name: 'Q3 Story' })).rejects.toThrow(ForbiddenException);
    });

    it('creates a DRAFT storyboard dropping untitled slides', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.CREATOR });
      const sb = await service.createStoryboard('t1', 'u1', { name: 'Q3 Story', slides: [{ title: 'Intro' }, { narrative: 'no title' }] });
      expect(sb.status).toBe(StoryboardStatus.DRAFT);
      expect(sb.slides).toHaveLength(1);
    });

    it('publishes a storyboard with slides and emits an event', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.CREATOR });
      storyboardRepo.findOne.mockResolvedValue({ id: 'sb1', tenantId: 't1', name: 'Q3', status: StoryboardStatus.DRAFT, slides: [{ title: 'Intro' }] });
      const pub = await service.publishStoryboard('t1', 'u1', 'sb1');
      expect(pub.status).toBe(StoryboardStatus.PUBLISHED);
      expect(pub.publishedAt).toBeInstanceOf(Date);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'analytics.storyboard_published', expect.objectContaining({ storyboardId: 'sb1' }));
    });

    it('refuses to publish an empty storyboard', async () => {
      licenseRepo.findOne.mockResolvedValue({ tenantId: 't1', userId: 'u1', tier: AnalyticsTier.CREATOR });
      storyboardRepo.findOne.mockResolvedValue({ id: 'sb1', tenantId: 't1', status: StoryboardStatus.DRAFT, slides: [] });
      await expect(service.publishStoryboard('t1', 'u1', 'sb1')).rejects.toThrow(BadRequestException);
    });
  });
});
