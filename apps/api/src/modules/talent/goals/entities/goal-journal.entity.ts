import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Journal entries on an objective: progress notes, milestones, and context
 * that check-in numbers alone don't capture.
 */
@Entity('tal_goal_journal')
@Index(['tenantId', 'objectiveId'])
export class GoalJournalEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'objective_id', type: 'uuid' }) objectiveId: string;
  @Column({ name: 'author_user_id' }) authorUserId: string;
  @Column({ name: 'author_name', length: 200 }) authorName: string;
  @Column({ type: 'text' }) entry: string;
  @CreateDateColumn() createdAt: Date;
}
