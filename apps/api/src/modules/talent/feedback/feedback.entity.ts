import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum FeedbackKind {
  PRAISE = 'PRAISE',
  SUGGESTION = 'SUGGESTION',
}

export enum FeedbackVisibility {
  PRIVATE = 'PRIVATE',   // visible to the subject only
  MANAGER = 'MANAGER',   // subject + their manager
  PUBLIC = 'PUBLIC',     // anyone in the tenant
}

export enum FeedbackRequestStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Continuous feedback: lightweight, always-on praise and suggestions. */
@Entity('tal_feedback')
@Index(['tenantId', 'toEmployeeId'])
export class ContinuousFeedback {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'from_user_id' }) fromUserId: string;
  @Column({ name: 'from_name', length: 200 }) fromName: string;
  @Column({ name: 'to_employee_id', type: 'uuid' }) toEmployeeId: string;
  @Column({ type: 'enum', enum: FeedbackKind, default: FeedbackKind.PRAISE }) kind: FeedbackKind;
  @Column({ type: 'enum', enum: FeedbackVisibility, default: FeedbackVisibility.MANAGER })
  visibility: FeedbackVisibility;
  @Column({ type: 'text' }) body: string;
  // Set when the feedback answers a request.
  @Column({ name: 'request_id', type: 'uuid', nullable: true }) requestId: string | null;
  @CreateDateColumn() createdAt: Date;
}

/** A pull for feedback: "tell me how X did on Y", sent to named responders. */
@Entity('tal_feedback_requests')
@Index(['tenantId', 'aboutEmployeeId'])
export class FeedbackRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'requested_by_user_id' }) requestedByUserId: string;
  @Column({ name: 'about_employee_id', type: 'uuid' }) aboutEmployeeId: string;
  @Column({ name: 'responder_user_ids', type: 'jsonb' }) responderUserIds: string[];
  @Column({ type: 'text' }) prompt: string;
  @Column({ type: 'enum', enum: FeedbackRequestStatus, default: FeedbackRequestStatus.OPEN })
  status: FeedbackRequestStatus;
  @CreateDateColumn() createdAt: Date;
}
