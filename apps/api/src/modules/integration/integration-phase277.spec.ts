import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationAdapter } from './entities/integration-adapter.entity';
import { IntegrationEvent, EventStatus } from './entities/integration-event.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('IntegrationService — Phase 277-280', () => {
  let service: IntegrationService;
  let adapterRepo: any, eventRepo: any;

  beforeEach(async () => {
    adapterRepo = mockRepo(); eventRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        IntegrationService,
        { provide: getRepositoryToken(IntegrationAdapter), useValue: adapterRepo },
        { provide: getRepositoryToken(IntegrationEvent), useValue: eventRepo },
      ],
    }).compile();
    service = module.get(IntegrationService);
  });

  // ─── Ph-277/278 ───────────────────────────────────────────────────

  it('listConnectorTemplates — includes the pre-built connectors', () => {
    const keys = service.listConnectorTemplates().map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['SALESFORCE', 'STRIPE', 'SHOPIFY', 'QUICKBOOKS', 'JIRA']));
  });

  it('createFromConnector — instantiates from a template', async () => {
    adapterRepo.findOne.mockResolvedValue(null);
    adapterRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const a = await service.createFromConnector('t1', 'STRIPE', 'stripe-prod');
    expect(a.connector).toBe('STRIPE');
    expect(a.code).toBe('stripe-prod');
  });

  it('createFromConnector — rejects an unknown connector', async () => {
    await expect(service.createFromConnector('t1', 'NOPE', 'x')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-279: delivery + retry + dead-letter ───────────────────────

  it('attemptDelivery — success marks DELIVERED', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', adapterId: 'a1', status: EventStatus.PENDING, attempts: 0 });
    adapterRepo.findOne.mockResolvedValue({ maxRetries: 3 });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const e = await service.attemptDelivery('t1', 'e1', true, '2026-06-30T10:00:00Z');
    expect(e.status).toBe(EventStatus.DELIVERED);
    expect(e.attempts).toBe(1);
  });

  it('attemptDelivery — failure stays FAILED until retries exhausted, then DEAD_LETTER', async () => {
    adapterRepo.findOne.mockResolvedValue({ maxRetries: 2 });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    eventRepo.findOne.mockResolvedValue({ id: 'e1', adapterId: 'a1', status: EventStatus.PENDING, attempts: 0 });
    const first = await service.attemptDelivery('t1', 'e1', false, '2026-06-30T10:00:00Z', 'timeout');
    expect(first.status).toBe(EventStatus.FAILED);
    eventRepo.findOne.mockResolvedValue({ id: 'e1', adapterId: 'a1', status: EventStatus.FAILED, attempts: 1 });
    const second = await service.attemptDelivery('t1', 'e1', false, '2026-06-30T10:05:00Z', 'timeout');
    expect(second.status).toBe(EventStatus.DEAD_LETTER);
  });

  it('replayDeadLetter — requeues a dead-letter event', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: EventStatus.DEAD_LETTER, attempts: 3 });
    eventRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const e = await service.replayDeadLetter('t1', 'e1');
    expect(e.status).toBe(EventStatus.PENDING);
    expect(e.attempts).toBe(0);
  });

  it('replayDeadLetter — rejects a non-dead-letter event', async () => {
    eventRepo.findOne.mockResolvedValue({ id: 'e1', status: EventStatus.DELIVERED });
    await expect(service.replayDeadLetter('t1', 'e1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-280: monitoring ───────────────────────────────────────────

  it('monitoring — per-adapter success rate and dead-letter queue', async () => {
    adapterRepo.find.mockResolvedValue([{ id: 'a1', code: 'stripe', connector: 'STRIPE' }]);
    eventRepo.find.mockResolvedValue([
      { adapterId: 'a1', status: EventStatus.DELIVERED, eventType: 'invoice.paid' },
      { adapterId: 'a1', status: EventStatus.DELIVERED, eventType: 'invoice.paid' },
      { adapterId: 'a1', status: EventStatus.DEAD_LETTER, eventType: 'refund', attempts: 3, lastError: 'x' },
    ]);
    const r = await service.monitoring('t1');
    expect(r.adapters[0].total).toBe(3);
    expect(r.adapters[0].successRate).toBeCloseTo(66.67, 1);
    expect(r.deadLetterCount).toBe(1);
  });
});
