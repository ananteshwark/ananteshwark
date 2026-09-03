import { Injectable, Logger } from '@nestjs/common';

export interface FulfillmentResult { fulfilled: boolean; reference?: string; reason?: string }

/**
 * Reward-store fulfillment seam. The default adapter records the intent and
 * reports "not wired"; a deployment integrated with an external reward vendor
 * (gift cards, merchandise) can provide a real adapter. Point debiting and
 * stock control happen in the service regardless, so the ledger stays correct
 * even when fulfillment is manual.
 */
@Injectable()
export class RewardFulfillmentAdapter {
  private readonly logger = new Logger(RewardFulfillmentAdapter.name);

  async fulfill(item: { name: string }, redemption: { id: string; userId: string }): Promise<FulfillmentResult> {
    this.logger.log(`reward seam: would fulfill "${item.name}" for redemption ${redemption.id} (no vendor wired)`);
    return { fulfilled: false, reason: 'Reward vendor not wired in this deployment' };
  }
}
