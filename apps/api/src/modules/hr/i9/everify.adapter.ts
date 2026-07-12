import { Injectable, Logger } from '@nestjs/common';
import { EVerifyResult } from './entities/i9-case.entity';

export interface EVerifySubmitResult {
  submitted: boolean;
  caseNumber?: string;
  result?: EVerifyResult;   // some cases return an immediate result
  reason?: string;
}

export interface EVerifyStatusResult {
  result?: EVerifyResult;
  reason?: string;
}

/**
 * Live E-Verify integration seam. E-Verify requires a USCIS web-service
 * account, so the default adapter performs no real submission and reports "not
 * wired" — the manual recordEVerify path continues to work. A deployment with
 * E-Verify access supplies a real adapter that submits a case and polls its
 * status.
 */
@Injectable()
export class EVerifyAdapter {
  private readonly logger = new Logger(EVerifyAdapter.name);

  async submitCase(payload: { employeeName: string; hireDate: string; section1: any; section2: any }): Promise<EVerifySubmitResult> {
    this.logger.log(`E-Verify seam: would submit a case for ${payload.employeeName} (not wired)`);
    return { submitted: false, reason: 'E-Verify integration not wired in this deployment' };
  }

  async checkStatus(caseNumber: string): Promise<EVerifyStatusResult> {
    this.logger.log(`E-Verify seam: would poll status for ${caseNumber} (not wired)`);
    return { reason: 'E-Verify integration not wired in this deployment' };
  }
}
