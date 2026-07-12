import { Injectable, Logger } from '@nestjs/common';

export interface FaceMatchResult { matched: boolean; employeeId?: string; confidence?: number; reason?: string }

/**
 * Facial-recognition seam. Matching is device/vendor dependent, so the default
 * adapter performs no biometric comparison and reports "not wired". A
 * deployment with a face-matching provider supplies a real adapter that
 * compares a probe against enrolled template refs and returns a confidence.
 * Raw biometrics never touch this service.
 */
@Injectable()
export class FaceMatchAdapter {
  private readonly logger = new Logger(FaceMatchAdapter.name);

  async match(probeRef: string, enrolled: Array<{ employeeId: string; templateRef: string }>): Promise<FaceMatchResult> {
    this.logger.log(`face seam: would match probe against ${enrolled.length} template(s) (not wired)`);
    return { matched: false, reason: 'Face-matching provider not wired in this deployment' };
  }
}
