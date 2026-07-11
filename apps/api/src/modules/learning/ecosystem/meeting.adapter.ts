import { Injectable, Logger } from '@nestjs/common';

export interface MeetingResult { created: boolean; joinUrl?: string; reason?: string }

/**
 * VILT meeting-provider seam (Zoom / Teams). The default adapter reports "not
 * wired" and returns no join URL; a deployment with Zoom/Teams API access can
 * supply a real adapter that returns a live join link. ILT (in-person)
 * sessions never touch this seam.
 */
@Injectable()
export class MeetingAdapter {
  private readonly logger = new Logger(MeetingAdapter.name);

  async createMeeting(provider: string, config: Record<string, any>, session: { title: string; startAt: string; endAt: string }): Promise<MeetingResult> {
    this.logger.log(`meeting seam: would create ${provider} meeting "${session.title}" (not wired)`);
    return { created: false, reason: `${provider} meeting provider not wired in this deployment` };
  }
}
