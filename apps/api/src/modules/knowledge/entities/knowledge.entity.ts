import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('kb_categories')
@Index(['tenantId', 'name'], { unique: true })
export class KbCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum KbArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * A knowledge-base article. Publishing freezes a version; editing a published
 * article mints a new version and reverts to DRAFT. View counts and helpful /
 * not-helpful votes drive ranking and deflection.
 */
@Entity('kb_articles')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'slug'], { unique: true })
export class KbArticle {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) title: string;
  @Column({ length: 220 }) slug: string;
  @Column({ type: 'text' }) body: string;
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null;
  @Column({ type: 'enum', enum: KbArticleStatus, default: KbArticleStatus.DRAFT }) status: KbArticleStatus;
  @Column({ type: 'int', default: 1 }) version: number;
  @Column({ type: 'jsonb', default: () => "'[]'" }) tags: string[];
  @Column({ name: 'view_count', type: 'int', default: 0 }) viewCount: number;
  @Column({ name: 'helpful_count', type: 'int', default: 0 }) helpfulCount: number;
  @Column({ name: 'not_helpful_count', type: 'int', default: 0 }) notHelpfulCount: number;
  @Column({ name: 'author_user_id', nullable: true }) authorUserId: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum EmailIntakeStatus {
  NEW = 'NEW',
  CONVERTED = 'CONVERTED',
  IGNORED = 'IGNORED',
}

/**
 * An inbound support email captured for triage. Deduped by message id;
 * converting one opens a helpdesk case and records the link.
 */
@Entity('kb_email_intakes')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'messageId'], { unique: true })
export class EmailIntake {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'message_id', length: 250 }) messageId: string;
  @Column({ name: 'thread_id', length: 250, nullable: true }) threadId: string | null;
  @Column({ name: 'from_email', length: 200 }) fromEmail: string;
  @Column({ length: 300 }) subject: string;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'enum', enum: EmailIntakeStatus, default: EmailIntakeStatus.NEW }) status: EmailIntakeStatus;
  @Column({ name: 'case_id', type: 'uuid', nullable: true }) caseId: string | null;
  @Column({ name: 'case_number', length: 20, nullable: true }) caseNumber: string | null;
  @Column({ name: 'received_at', type: 'timestamptz', nullable: true }) receivedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
