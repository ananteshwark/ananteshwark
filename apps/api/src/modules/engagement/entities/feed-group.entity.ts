import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Group space (a "Vibe group"): a scoped feed with membership. Optionally
 * moderated — posts by non-owners land in the moderation queue first.
 */
@Entity('eng_feed_groups')
@Index(['tenantId', 'name'], { unique: true })
export class FeedGroup {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'owner_user_id' }) ownerUserId: string;
  // userIds of members (owner is always a member).
  @Column({ name: 'member_user_ids', type: 'jsonb', default: () => "'[]'" }) memberUserIds: string[];
  // When true, posts by non-owner members require moderator approval.
  @Column({ default: false }) moderated: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
