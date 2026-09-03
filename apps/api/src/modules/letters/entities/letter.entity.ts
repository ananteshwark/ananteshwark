import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum LetterType {
  OFFER         = 'OFFER',
  APPOINTMENT   = 'APPOINTMENT',
  CONFIRMATION  = 'CONFIRMATION',
  INCREMENT     = 'INCREMENT',
  PROMOTION     = 'PROMOTION',
  TRANSFER      = 'TRANSFER',
  RELIEVING     = 'RELIEVING',
  EXPERIENCE    = 'EXPERIENCE',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
  WARNING       = 'WARNING',
  CUSTOM        = 'CUSTOM',
}

@Entity('ltr_templates')
@Index(['tenantId', 'code'], { unique: true })
export class LetterTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: LetterType, default: LetterType.CUSTOM }) type: LetterType;
  @Column() subject: string;
  // Body with {{placeholders}} — merged from employee fields + custom data at generation time.
  @Column({ type: 'text' }) body: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}

export enum IssuedLetterStatus {
  DRAFT   = 'DRAFT',
  ISSUED  = 'ISSUED',
  REVOKED = 'REVOKED',
}

@Entity('ltr_issued')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'letterNumber'], { unique: true })
export class IssuedLetter {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'letter_number', length: 20 }) letterNumber: string;
  @Column({ name: 'template_id' }) templateId: string;
  @Column({ name: 'template_name' }) templateName: string;
  @Column({ name: 'letter_type', type: 'enum', enum: LetterType, default: LetterType.CUSTOM }) letterType: LetterType;
  @Column({ name: 'employee_id' }) employeeId: string;
  @Column({ name: 'employee_name' }) employeeName: string;
  @Column({ name: 'rendered_subject' }) renderedSubject: string;
  @Column({ name: 'rendered_body', type: 'text' }) renderedBody: string;
  @Column({ type: 'enum', enum: IssuedLetterStatus, default: IssuedLetterStatus.DRAFT }) status: IssuedLetterStatus;
  @Column({ name: 'issued_by_user_id', nullable: true }) issuedByUserId: string | null;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
