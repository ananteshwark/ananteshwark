import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum FeedPostType {
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  POST         = 'POST',
  POLL         = 'POLL',
}

export enum ModerationStatus {
  APPROVED = 'APPROVED', // visible in the feed
  PENDING  = 'PENDING',  // held in the moderation queue
  REJECTED = 'REJECTED', // rejected by a moderator
}

export interface PollOption {
  id: string;
  text: string;
}

@Entity('eng_feed_posts')
@Index(['tenantId', 'createdAt'])
export class FeedPost {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'author_user_id' }) authorUserId: string;
  @Column({ name: 'author_name' }) authorName: string;
  @Column({ type: 'enum', enum: FeedPostType, default: FeedPostType.POST }) type: FeedPostType;
  @Column({ nullable: true }) title: string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ default: false }) pinned: boolean;
  @Column({ name: 'poll_options', type: 'jsonb', nullable: true }) pollOptions: PollOption[] | null;
  // { userId: optionId } — one vote per user, revotes overwrite.
  @Column({ name: 'poll_votes', type: 'jsonb', default: () => "'{}'" }) pollVotes: Record<string, string>;
  // userIds that liked the post.
  @Column({ name: 'liked_by', type: 'jsonb', default: () => "'[]'" }) likedBy: string[];
  @Column({ name: 'comment_count', type: 'int', default: 0 }) commentCount: number;
  // Group scoping: null = company-wide feed.
  @Column({ name: 'group_id', type: 'uuid', nullable: true }) groupId: string | null;
  // Moderation state — posts in a moderated group start PENDING.
  @Column({ name: 'moderation_status', type: 'enum', enum: ModerationStatus, default: ModerationStatus.APPROVED })
  moderationStatus: ModerationStatus;
  // userIds who reported the post (for the moderation queue).
  @Column({ name: 'reported_by', type: 'jsonb', default: () => "'[]'" }) reportedBy: string[];
  @CreateDateColumn() createdAt: Date;
}

@Entity('eng_feed_comments')
@Index(['tenantId', 'postId'])
export class FeedComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'post_id' }) postId: string;
  @Column({ name: 'author_user_id' }) authorUserId: string;
  @Column({ name: 'author_name' }) authorName: string;
  @Column({ type: 'text' }) body: string;
  @CreateDateColumn() createdAt: Date;
}
