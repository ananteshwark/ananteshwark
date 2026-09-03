import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum NominationProgramStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum NominationStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Nomination-based recognition program (e.g. "Employee of the Quarter"):
 * an award period with an optional voting panel and a points value granted
 * when a nomination wins.
 */
@Entity('eng_recognition_programs')
@Index(['tenantId', 'status'])
export class RecognitionProgram {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'badge_id', type: 'uuid', nullable: true }) badgeId: string | null;
  @Column({ type: 'int', default: 0 }) points: number;
  // userIds who may vote on nominations; empty = any manager decides directly.
  @Column({ name: 'panel_user_ids', type: 'jsonb', default: () => "'[]'" }) panelUserIds: string[];
  // Votes needed to auto-approve a nomination; 0 = manual decision only.
  @Column({ name: 'votes_to_win', type: 'int', default: 0 }) votesToWin: number;
  @Column({ type: 'enum', enum: NominationProgramStatus, default: NominationProgramStatus.OPEN })
  status: NominationProgramStatus;
  @Column({ name: 'opens_on', type: 'date', nullable: true }) opensOn: string | null;
  @Column({ name: 'closes_on', type: 'date', nullable: true }) closesOn: string | null;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('eng_recognition_nominations')
@Index(['tenantId', 'programId'])
export class RecognitionNomination {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'program_id', type: 'uuid' }) programId: string;
  @Column({ name: 'nominee_employee_id', type: 'uuid' }) nomineeEmployeeId: string;
  @Column({ name: 'nominee_name', length: 200 }) nomineeName: string;
  @Column({ name: 'nominated_by_user_id' }) nominatedByUserId: string;
  @Column({ name: 'nominated_by_name', length: 200 }) nominatedByName: string;
  @Column({ type: 'text' }) justification: string;
  // panel userIds who voted for this nomination.
  @Column({ name: 'voted_by', type: 'jsonb', default: () => "'[]'" }) votedBy: string[];
  @Column({ type: 'enum', enum: NominationStatus, default: NominationStatus.SUBMITTED })
  status: NominationStatus;
  @Column({ name: 'recognition_id', type: 'uuid', nullable: true }) recognitionId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
