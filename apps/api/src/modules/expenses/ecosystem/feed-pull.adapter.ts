import { Injectable, Logger } from '@nestjs/common';

export interface PullResult { pulled: boolean; transactions: any[]; reason?: string }

/**
 * Card/trip feed-pull seam. The primary ingest path is push (provider webhook
 * or file upload → ingest*), but some providers require polling their API. The
 * default adapter reports "not wired" and pulls nothing; a deployment with card
 * network / TMS API access supplies a real puller.
 */
@Injectable()
export class FeedPullAdapter {
  private readonly logger = new Logger(FeedPullAdapter.name);

  async pull(provider: string, config: Record<string, any>, since: string): Promise<PullResult> {
    this.logger.log(`feed seam: would pull ${provider} transactions since ${since} (not wired)`);
    return { pulled: false, transactions: [], reason: `${provider} feed pull not wired in this deployment` };
  }
}
