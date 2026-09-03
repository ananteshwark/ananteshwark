import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelSubscription, NotificationChannel, ChannelDelivery, ChannelDeliveryStatus } from './entities/channel.entity';
import { ChannelAdapter } from './channel.adapter';

@Injectable()
export class ChannelDispatchService {
  constructor(
    @InjectRepository(ChannelSubscription) private readonly subRepo: Repository<ChannelSubscription>,
    @InjectRepository(ChannelDelivery) private readonly deliveryRepo: Repository<ChannelDelivery>,
    private readonly adapter: ChannelAdapter,
  ) {}

  async subscribe(tenantId: string, userId: string, dto: { channel: NotificationChannel; target: Record<string, any> }): Promise<ChannelSubscription> {
    if (!Object.values(NotificationChannel).includes(dto.channel)) throw new BadRequestException('A valid channel is required');
    const err = ChannelAdapter.validateTarget(dto.channel, dto.target ?? {});
    if (err) throw new BadRequestException(`Invalid ${dto.channel} target: ${err}`);
    let sub = await this.subRepo.findOne({ where: { tenantId, userId, channel: dto.channel } });
    if (!sub) sub = this.subRepo.create({ tenantId, userId, channel: dto.channel });
    sub.target = dto.target;
    sub.enabled = true;
    return this.subRepo.save(sub);
  }

  listSubscriptions(tenantId: string, userId: string): Promise<ChannelSubscription[]> {
    return this.subRepo.find({ where: { tenantId, userId }, order: { channel: 'ASC' } });
  }

  async setEnabled(tenantId: string, id: string, enabled: boolean): Promise<ChannelSubscription> {
    const sub = await this.subRepo.findOne({ where: { id, tenantId } });
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);
    sub.enabled = enabled;
    return this.subRepo.save(sub);
  }

  /**
   * Dispatch a message to a user's channels. Each enabled subscription (or the
   * requested subset) is attempted through the adapter seam and an audit
   * ChannelDelivery is recorded per channel.
   */
  async dispatch(tenantId: string, userId: string, message: { title: string; body: string; channels?: NotificationChannel[] }): Promise<ChannelDelivery[]> {
    if (!message.title?.trim()) throw new BadRequestException('title is required');
    let subs = (await this.subRepo.find({ where: { tenantId, userId } })).filter((s) => s.enabled);
    if (message.channels?.length) subs = subs.filter((s) => message.channels!.includes(s.channel));

    const out: ChannelDelivery[] = [];
    for (const sub of subs) {
      const res = await this.adapter.send(sub.channel, sub.target, message);
      out.push(await this.deliveryRepo.save(this.deliveryRepo.create({
        tenantId, userId, channel: sub.channel, title: message.title, body: message.body,
        status: res.sent ? ChannelDeliveryStatus.SENT : ChannelDeliveryStatus.SKIPPED,
        reference: res.reference ?? null, error: res.sent ? null : (res.reason ?? null),
        sentAt: res.sent ? new Date() : null,
      })));
    }
    return out;
  }

  listDeliveries(tenantId: string, userId: string): Promise<ChannelDelivery[]> {
    return this.deliveryRepo.find({ where: { tenantId, userId }, order: { createdAt: 'DESC' } });
  }
}
