import { Injectable, Logger, Optional } from '@nestjs/common';
import { LeaveService } from '../../hr/leave/leave.service';
import { AccrualType } from '../../hr/leave/entities/leave-type.entity';
import { RecognitionService } from '../../engagement/recognition.service';
import { LettersService } from '../../letters/letters.service';
import { LetterType } from '../../letters/entities/letter.entity';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { JourneysService } from '../../hr/journeys/journeys.service';
import { JourneyTrigger } from '../../hr/journeys/entities/journey.entity';

export interface StarterKitResult {
  leaveTypes: number;
  badges: number;
  letterTemplates: number;
  kbCategories: number;
  journeyTemplates: number;
}

/**
 * First-run content for a new tenant so registration lands in a workable
 * product instead of an empty shell: default leave types, recognition
 * badges, letter templates (including MERIT_INCREMENT, which the merit
 * cycle's approval handoff generates letters from), knowledge-base
 * categories and onboarding/offboarding journey templates.
 *
 * Every section is idempotent (skipped when the tenant already has content
 * of that kind) and best-effort: a failing section logs and moves on, and
 * seeding as a whole must never fail registration. All dependencies are
 * optional so the service degrades to a no-op in deployments that exclude
 * a feature module.
 */
@Injectable()
export class StarterKitService {
  private readonly logger = new Logger(StarterKitService.name);

  constructor(
    @Optional() private readonly leave?: LeaveService,
    @Optional() private readonly recognition?: RecognitionService,
    @Optional() private readonly letters?: LettersService,
    @Optional() private readonly knowledge?: KnowledgeService,
    @Optional() private readonly journeys?: JourneysService,
  ) {}

  async seed(tenantId: string): Promise<StarterKitResult> {
    const [leaveTypes, badges, letterTemplates, kbCategories, journeyTemplates] = await Promise.all([
      this.seedLeaveTypes(tenantId).catch((e) => { this.logger.warn(`leave types: ${e.message}`); return 0; }),
      this.seedBadges(tenantId).catch((e) => { this.logger.warn(`badges: ${e.message}`); return 0; }),
      this.seedLetterTemplates(tenantId).catch((e) => { this.logger.warn(`letter templates: ${e.message}`); return 0; }),
      this.seedKbCategories(tenantId).catch((e) => { this.logger.warn(`kb categories: ${e.message}`); return 0; }),
      this.seedJourneyTemplates(tenantId).catch((e) => { this.logger.warn(`journey templates: ${e.message}`); return 0; }),
    ]);
    return { leaveTypes, badges, letterTemplates, kbCategories, journeyTemplates };
  }

  private async seedLeaveTypes(tenantId: string): Promise<number> {
    if (!this.leave) return 0;
    const existing = await this.leave.listLeaveTypes(tenantId);
    if (existing.length > 0) return 0;
    const defaults = [
      { code: 'AL', name: 'Annual Leave', accrualType: AccrualType.MONTHLY, accrualRate: 1.5, maxBalance: 30, maxCarryForward: 10, isPaid: true },
      { code: 'SL', name: 'Sick Leave', accrualType: AccrualType.YEARLY, accrualRate: 10, maxBalance: 10, maxCarryForward: 0, isPaid: true },
      { code: 'CL', name: 'Casual Leave', accrualType: AccrualType.YEARLY, accrualRate: 7, maxBalance: 7, maxCarryForward: 0, isPaid: true },
      { code: 'UPL', name: 'Unpaid Leave', accrualType: AccrualType.MANUAL, isPaid: false },
    ];
    for (const lt of defaults) await this.leave.createLeaveType(tenantId, lt as any);
    return defaults.length;
  }

  private async seedBadges(tenantId: string): Promise<number> {
    if (!this.recognition) return 0;
    const existing = await this.recognition.listBadges(tenantId);
    if (existing.length > 0) return 0;
    const defaults = [
      { name: 'Team Player', icon: '🤝', points: 10, description: 'Consistently lifts the people around them' },
      { name: 'Above & Beyond', icon: '🚀', points: 25, description: 'Went far past what the job asked for' },
      { name: 'Customer Hero', icon: '🎯', points: 20, description: 'Turned a customer moment into a win' },
      { name: 'Innovation Star', icon: '💡', points: 25, description: 'Shipped a better way of doing things' },
      { name: 'Milestone', icon: '🏅', points: 50, description: 'Work anniversary or major achievement' },
    ];
    for (const b of defaults) await this.recognition.createBadge(tenantId, b);
    return defaults.length;
  }

  private async seedLetterTemplates(tenantId: string): Promise<number> {
    if (!this.letters) return 0;
    const existing = await this.letters.listTemplates(tenantId);
    if (existing.length > 0) return 0;
    const signoff = '\n\nSincerely,\nHuman Resources\n{{companyName}}';
    const defaults = [
      {
        code: 'OFFER', name: 'Offer Letter', type: LetterType.OFFER, subject: 'Offer of Employment — {{employeeName}}',
        body: `Dear {{firstName}},\n\nWe are delighted to offer you the position of {{designation}} with a start date of {{dateOfJoining}}. Your annual compensation will be {{ctc}}.\n\nPlease confirm your acceptance by {{acceptanceDeadline}}.${signoff}`,
      },
      {
        code: 'APPOINTMENT', name: 'Appointment Letter', type: LetterType.APPOINTMENT, subject: 'Letter of Appointment — {{employeeName}}',
        body: `Dear {{firstName}},\n\nWe are pleased to confirm your appointment as {{designation}} effective {{dateOfJoining}}. Your employee code is {{employeeCode}}.${signoff}`,
      },
      {
        code: 'CONFIRMATION', name: 'Probation Confirmation', type: LetterType.CONFIRMATION, subject: 'Confirmation of Employment — {{employeeName}}',
        body: `Dear {{firstName}},\n\nFollowing a review of your performance, we are pleased to confirm your employment effective {{confirmationDate}}.${signoff}`,
      },
      {
        code: 'MERIT_INCREMENT', name: 'Merit Increment Letter', type: LetterType.INCREMENT, subject: 'Compensation Revision — {{employeeName}}',
        body: `Dear {{firstName}},\n\nIn recognition of your performance, your compensation has been revised by {{proposedPct}}% effective {{effectiveDate}}. Your revised salary is {{newSalary}}.\n\nThank you for your contribution.${signoff}`,
      },
      {
        code: 'EXPERIENCE', name: 'Experience Letter', type: LetterType.EXPERIENCE, subject: 'Experience Certificate — {{employeeName}}',
        body: `To whom it may concern,\n\nThis is to certify that {{employeeName}} ({{employeeCode}}) was employed with us from {{dateOfJoining}} to {{lastWorkingDate}}, most recently as {{designation}}.${signoff}`,
      },
      {
        code: 'RELIEVING', name: 'Relieving Letter', type: LetterType.RELIEVING, subject: 'Relieving Letter — {{employeeName}}',
        body: `Dear {{firstName}},\n\nThis confirms that you have been relieved from your duties effective the close of business on {{lastWorkingDate}}. We thank you for your service and wish you the best.${signoff}`,
      },
    ];
    for (const t of defaults) await this.letters.createTemplate(tenantId, t as any);
    return defaults.length;
  }

  private async seedKbCategories(tenantId: string): Promise<number> {
    if (!this.knowledge) return 0;
    const existing = await this.knowledge.listCategories(tenantId);
    if (existing.length > 0) return 0;
    const defaults = [
      { name: 'Getting Started', description: 'Orientation guides for new joiners' },
      { name: 'HR Policies', description: 'Leave, conduct, travel and expense policies' },
      { name: 'Payroll & Benefits', description: 'Salary, tax declarations and benefits enrolment' },
      { name: 'IT & Systems', description: 'Accounts, devices and tooling how-tos' },
    ];
    for (const c of defaults) await this.knowledge.createCategory(tenantId, c);
    return defaults.length;
  }

  private async seedJourneyTemplates(tenantId: string): Promise<number> {
    if (!this.journeys) return 0;
    const existing = await this.journeys.listTemplates(tenantId);
    if (existing.length > 0) return 0;
    await this.journeys.createTemplate(tenantId, {
      name: 'New Hire Onboarding',
      triggerEvent: JourneyTrigger.ONBOARDING,
      steps: [
        { key: 'preboarding', title: 'Collect documents & complete pre-boarding forms', ownerRole: 'HR', offsetDays: -3 },
        { key: 'it_setup', title: 'Provision accounts, device and access', ownerRole: 'IT', offsetDays: 0 },
        { key: 'welcome', title: 'Welcome meeting & team introductions', ownerRole: 'MANAGER', offsetDays: 0 },
        { key: 'checkin_30', title: '30-day check-in', ownerRole: 'MANAGER', offsetDays: 30 },
        { key: 'review_90', title: '90-day review & goal setting', ownerRole: 'MANAGER', offsetDays: 90 },
      ],
    });
    await this.journeys.createTemplate(tenantId, {
      name: 'Employee Offboarding',
      triggerEvent: JourneyTrigger.OFFBOARDING,
      steps: [
        { key: 'knowledge_transfer', title: 'Knowledge transfer & handover plan', ownerRole: 'MANAGER', offsetDays: -14 },
        { key: 'exit_interview', title: 'Exit interview', ownerRole: 'HR', offsetDays: -2 },
        { key: 'asset_return', title: 'Return company assets', ownerRole: 'IT', offsetDays: 0 },
        { key: 'access_revocation', title: 'Revoke system access', ownerRole: 'IT', offsetDays: 0 },
      ],
    });
    return 2;
  }
}
