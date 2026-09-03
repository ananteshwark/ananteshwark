import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum FormFieldType {
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  EMAIL = 'EMAIL',
  SELECT = 'SELECT',
  MULTISELECT = 'MULTISELECT',
  CHECKBOX = 'CHECKBOX',
}

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];        // for SELECT / MULTISELECT
  min?: number;              // NUMBER min or string minLength
  max?: number;              // NUMBER max or string maxLength
  pattern?: string;          // regex for TEXT/EMAIL
  helpText?: string;
}

export enum FormStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * A tenant-defined dynamic form. Fields are a JSON schema; publishing freezes
 * a version that submissions validate against.
 */
@Entity('pf_form_definitions')
@Index(['tenantId', 'key'], { unique: true })
export class FormDefinition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 80 }) key: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: FormStatus, default: FormStatus.DRAFT }) status: FormStatus;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'jsonb', default: () => "'[]'" }) fields: FormField[];
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/** A validated submission against a specific published form version. */
@Entity('pf_form_submissions')
@Index(['tenantId', 'formId'])
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'form_id', type: 'uuid' }) formId: string;
  @Column({ name: 'form_version', type: 'int' }) formVersion: number;
  @Column({ name: 'submitted_by_user_id', nullable: true }) submittedByUserId: string | null;
  // Optional reference to the entity this submission is about (employee, case…).
  @Column({ name: 'subject_ref', length: 120, nullable: true }) subjectRef: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) values: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
}
