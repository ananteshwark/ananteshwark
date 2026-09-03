import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum IdpStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum IdpItemType {
  COURSE = 'COURSE',
  MENTORING = 'MENTORING',
  STRETCH_ASSIGNMENT = 'STRETCH_ASSIGNMENT',
  CERTIFICATION = 'CERTIFICATION',
  OTHER = 'OTHER',
}

export enum IdpItemStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

/**
 * Individual Development Plan: an aspiration plus concrete development items
 * (courses, mentoring, stretch work, certifications). Items can link to
 * learning courses and skills so progress feeds the wider talent picture.
 */
@Entity('tal_idp_plans')
@Index(['tenantId', 'employeeId'])
export class IdpPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ length: 200 }) title: string;
  @Column({ type: 'text', nullable: true }) aspiration: string | null;
  @Column({ type: 'enum', enum: IdpStatus, default: IdpStatus.DRAFT }) status: IdpStatus;
  @Column({ name: 'target_date', type: 'date', nullable: true }) targetDate: string | null;
  @Column({ name: 'created_by_user_id' }) createdByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('tal_idp_items')
@Index(['tenantId', 'planId'])
export class IdpItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ name: 'item_type', type: 'enum', enum: IdpItemType, default: IdpItemType.OTHER })
  itemType: IdpItemType;
  @Column({ length: 300 }) title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Optional links into the wider talent graph.
  @Column({ name: 'course_id', type: 'uuid', nullable: true }) courseId: string | null;
  @Column({ name: 'skill_id', type: 'uuid', nullable: true }) skillId: string | null;
  @Column({ type: 'enum', enum: IdpItemStatus, default: IdpItemStatus.NOT_STARTED })
  status: IdpItemStatus;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
