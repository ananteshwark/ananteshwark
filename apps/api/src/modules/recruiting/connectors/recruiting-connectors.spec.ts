import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecruitingConnectorsService } from './recruiting-connectors.service';
import { ConnectorAdapter } from './connector.adapter';
import { ConnectorType, PublicationStatus, AssessmentStatus } from './entities/connector.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('RecruitingConnectorsService', () => {
  let service: RecruitingConnectorsService;
  let connectorRepo: any, pubRepo: any, orderRepo: any, adapter: ConnectorAdapter, automation: any;

  beforeEach(() => {
    connectorRepo = mockRepo(); pubRepo = mockRepo(); orderRepo = mockRepo();
    adapter = new ConnectorAdapter();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new RecruitingConnectorsService(connectorRepo, pubRepo, orderRepo, adapter, automation);
  });

  describe('registry', () => {
    it('registers a job-board connector', async () => {
      const c = await service.registerConnector('t1', { type: ConnectorType.JOB_BOARD, provider: 'linkedin' });
      expect(c).toMatchObject({ type: ConnectorType.JOB_BOARD, provider: 'linkedin', enabled: true });
    });

    it('rejects an unknown connector type', async () => {
      await expect(service.registerConnector('t1', { type: 'CARRIER_PIGEON' as any, provider: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('publishJob', () => {
    it('records a PENDING publication when the board transport is not wired', async () => {
      connectorRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', type: ConnectorType.JOB_BOARD, provider: 'linkedin', config: {}, enabled: true });
      const pub = await service.publishJob('t1', { jobId: 'job1', connectorId: 'c1', title: 'Engineer' });
      expect(pub).toMatchObject({ jobId: 'job1', status: PublicationStatus.PENDING });
      expect(pub.error).toMatch(/not wired/);
      expect(automation.emit).not.toHaveBeenCalled();
    });

    it('rejects publishing through a wrong-type connector', async () => {
      connectorRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', type: ConnectorType.CALENDAR, provider: 'google', enabled: true });
      await expect(service.publishJob('t1', { jobId: 'job1', connectorId: 'c1' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a disabled connector', async () => {
      connectorRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', type: ConnectorType.JOB_BOARD, provider: 'linkedin', enabled: false });
      await expect(service.publishJob('t1', { jobId: 'job1', connectorId: 'c1' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('assessments', () => {
    it('orders an assessment (ORDERED)', async () => {
      connectorRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', type: ConnectorType.ASSESSMENT, provider: 'hackerrank', config: {}, enabled: true });
      const order = await service.orderAssessment('t1', { candidateId: 'cand1', connectorId: 'c1', assessmentKey: 'js-basics' });
      expect(order).toMatchObject({ candidateId: 'cand1', status: AssessmentStatus.ORDERED });
    });

    it('ingests a result matched by external ref and emits assessment.completed', async () => {
      orderRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', candidateId: 'cand1', provider: 'hackerrank', externalRef: 'EXT-1' });
      const updated = await service.ingestAssessmentResult('t1', { externalRef: 'EXT-1', score: 87, resultUrl: 'https://r/1' });
      expect(updated).toMatchObject({ status: AssessmentStatus.COMPLETED, score: 87 });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'assessment.completed', expect.objectContaining({ candidateId: 'cand1', score: 87 }));
    });

    it('throws when no order matches the external ref', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.ingestAssessmentResult('t1', { externalRef: 'nope' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('calendar', () => {
    it('reports scheduled:false when the calendar transport is not wired', async () => {
      connectorRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', type: ConnectorType.CALENDAR, provider: 'google', config: {}, enabled: true });
      const res = await service.scheduleEvent('t1', { connectorId: 'c1', summary: 'Interview', start: '2026-07-11T09:00:00Z', end: '2026-07-11T10:00:00Z' });
      expect(res.scheduled).toBe(false);
      expect(res.reason).toMatch(/not wired/);
    });
  });
});
