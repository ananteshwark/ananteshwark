import { BadRequestException } from '@nestjs/common';
import { ChannelDispatchService } from './channel-dispatch.service';
import { RewardStoreService } from './reward-store.service';
import { ChannelAdapter } from './channel.adapter';
import { RewardFulfillmentAdapter } from './reward.adapter';
import { NotificationChannel, ChannelDeliveryStatus } from './entities/channel.entity';
import { RedemptionStatus } from './entities/reward.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ChannelDispatchService', () => {
  let service: ChannelDispatchService;
  let subRepo: any, deliveryRepo: any, adapter: ChannelAdapter;

  beforeEach(() => {
    subRepo = mockRepo(); deliveryRepo = mockRepo();
    adapter = new ChannelAdapter();
    service = new ChannelDispatchService(subRepo, deliveryRepo, adapter);
  });

  it('rejects a subscription with an invalid target', async () => {
    await expect(service.subscribe('t1', 'u1', { channel: NotificationChannel.TEAMS, target: {} })).rejects.toThrow(BadRequestException);
  });

  it('subscribes with a valid Teams webhook', async () => {
    subRepo.findOne.mockResolvedValue(null);
    const sub = await service.subscribe('t1', 'u1', { channel: NotificationChannel.TEAMS, target: { webhookUrl: 'https://teams/x' } });
    expect(sub).toMatchObject({ channel: NotificationChannel.TEAMS, enabled: true });
  });

  it('dispatches across enabled channels, recording SKIPPED when no transport is wired', async () => {
    subRepo.find.mockResolvedValue([
      { channel: NotificationChannel.TEAMS, target: { webhookUrl: 'https://teams/x' }, enabled: true },
      { channel: NotificationChannel.SLACK, target: { webhookUrl: 'https://slack/y' }, enabled: false }, // disabled → skipped
    ]);
    const out = await service.dispatch('t1', 'u1', { title: 'Hi', body: 'there' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ channel: NotificationChannel.TEAMS, status: ChannelDeliveryStatus.SKIPPED });
    expect(out[0].error).toMatch(/not wired/);
  });

  it('validateTarget enforces per-channel requirements', () => {
    expect(ChannelAdapter.validateTarget(NotificationChannel.WEB_PUSH, {})).toMatch(/endpoint/);
    expect(ChannelAdapter.validateTarget(NotificationChannel.WEB_PUSH, { endpoint: 'x' })).toBeNull();
    expect(ChannelAdapter.validateTarget(NotificationChannel.EMAIL, { address: 'a@b.com' })).toBeNull();
  });

  describe('live Teams/Slack webhook transport (CHANNEL_WEBHOOKS_ENABLED=true)', () => {
    afterEach(() => { delete process.env.CHANNEL_WEBHOOKS_ENABLED; });

    const liveAdapter = (fetchImpl: any) => {
      process.env.CHANNEL_WEBHOOKS_ENABLED = 'true';
      const a = new ChannelAdapter();
      a.fetchFn = fetchImpl;
      return a;
    };

    it('POSTs { text } to the incoming webhook and reports SENT', async () => {
      const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      const a = liveAdapter(fetchFn);
      const res = await a.send(NotificationChannel.SLACK, { webhookUrl: 'https://hooks.slack.com/services/x' }, { title: 'Hi', body: 'there' });
      expect(res.sent).toBe(true);
      expect(fetchFn).toHaveBeenCalledWith('https://hooks.slack.com/services/x', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: '**Hi**\n\nthere' }),
      }));
    });

    it('rejects non-https webhook URLs without making a request', async () => {
      const fetchFn = jest.fn();
      const a = liveAdapter(fetchFn);
      const res = await a.send(NotificationChannel.TEAMS, { webhookUrl: 'http://internal/hook' }, { title: 'x', body: 'y' });
      expect(res).toMatchObject({ sent: false, reason: expect.stringMatching(/https/) });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('reports the HTTP status on a failed delivery and never throws on network errors', async () => {
      const a = liveAdapter(jest.fn().mockResolvedValue({ ok: false, status: 410 }));
      expect((await a.send(NotificationChannel.SLACK, { webhookUrl: 'https://x/y' }, { title: 't', body: 'b' })).reason).toMatch(/410/);

      const b = liveAdapter(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const res = await b.send(NotificationChannel.TEAMS, { webhookUrl: 'https://x/y' }, { title: 't', body: 'b' });
      expect(res).toMatchObject({ sent: false, reason: expect.stringMatching(/ECONNREFUSED/) });
    });

    it('stays a not-wired seam when the flag is off', async () => {
      const fetchFn = jest.fn();
      const a = new ChannelAdapter();
      a.fetchFn = fetchFn;
      const res = await a.send(NotificationChannel.SLACK, { webhookUrl: 'https://x/y' }, { title: 't', body: 'b' });
      expect(res.reason).toMatch(/not wired/);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});

describe('RewardStoreService', () => {
  let service: RewardStoreService;
  let itemRepo: any, redemptionRepo: any, fulfillment: RewardFulfillmentAdapter, automation: any;

  beforeEach(() => {
    itemRepo = mockRepo(); redemptionRepo = mockRepo();
    fulfillment = new RewardFulfillmentAdapter();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new RewardStoreService(itemRepo, redemptionRepo, fulfillment, automation);
  });

  it('rejects redemption when points are insufficient', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', name: 'Mug', pointsCost: 100, active: true, stock: null });
    await expect(service.redeem('t1', 'u1', 'i1', 50)).rejects.toThrow(BadRequestException);
  });

  it('rejects redemption when out of stock', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', name: 'Mug', pointsCost: 100, active: true, stock: 0 });
    await expect(service.redeem('t1', 'u1', 'i1', 500)).rejects.toThrow(BadRequestException);
  });

  it('redeems: decrements stock, records REQUESTED, emits reward.redeemed', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', name: 'Mug', pointsCost: 100, active: true, stock: 3 });
    const r = await service.redeem('t1', 'u1', 'i1', 500);
    expect(r).toMatchObject({ status: RedemptionStatus.REQUESTED, pointsSpent: 100 });
    expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ stock: 2 }));
    expect(automation.emit).toHaveBeenCalledWith('t1', 'reward.redeemed', expect.objectContaining({ itemName: 'Mug', fulfilled: false }));
  });

  describe('recognition-ledger balance', () => {
    const withLedger = (recognition: any) =>
      new RewardStoreService(itemRepo, redemptionRepo, fulfillment, automation, recognition);

    it('computes earned minus live redemptions', async () => {
      const recognition: any = { pointsFor: jest.fn().mockResolvedValue(500) };
      redemptionRepo.find.mockResolvedValue([
        { pointsSpent: 100, status: RedemptionStatus.FULFILLED },
        { pointsSpent: 50, status: RedemptionStatus.REQUESTED },
        { pointsSpent: 999, status: RedemptionStatus.CANCELLED }, // refunded — not spent
      ]);
      const b = await withLedger(recognition).balance('t1', 'e1');
      expect(b).toEqual({ earned: 500, spent: 150, available: 350 });
    });

    it('redeem derives affordability from the ledger when availablePoints is omitted', async () => {
      const recognition: any = { pointsFor: jest.fn().mockResolvedValue(120) };
      redemptionRepo.find.mockResolvedValue([]);
      itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', name: 'Mug', pointsCost: 100, active: true, stock: null });
      const r = await withLedger(recognition).redeem('t1', 'e1', 'i1');
      expect(r.pointsSpent).toBe(100);

      // Second redemption: 120 earned − 100 live = 20 < 100 → rejected.
      redemptionRepo.find.mockResolvedValue([{ pointsSpent: 100, status: RedemptionStatus.REQUESTED }]);
      await expect(withLedger(recognition).redeem('t1', 'e1', 'i1')).rejects.toThrow(BadRequestException);
    });

    it('requires explicit availablePoints when no ledger is connected', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', name: 'Mug', pointsCost: 100, active: true, stock: null });
      await expect(service.redeem('t1', 'e1', 'i1')).rejects.toThrow(BadRequestException);
    });
  });

  it('restocks on cancellation of a requested redemption', async () => {
    redemptionRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', itemId: 'i1', status: RedemptionStatus.REQUESTED });
    itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', stock: 2 });
    const r = await service.setRedemptionStatus('t1', 'r1', RedemptionStatus.CANCELLED);
    expect(r.status).toBe(RedemptionStatus.CANCELLED);
    expect(itemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ stock: 3 }));
  });
});
