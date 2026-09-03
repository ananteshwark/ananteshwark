import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ArticleVisibility {
  PUBLIC = 'PUBLIC',     // visible in self-service portal
  INTERNAL = 'INTERNAL', // agents only
}

export enum ArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Ph-229 — A knowledge-base article used for ticket resolution and self-service
 * deflection.
 */
@Entity('svc_kb_articles')
@Index(['tenantId', 'category'])
export class KbArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 250 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ type: 'enum', enum: ArticleVisibility, default: ArticleVisibility.PUBLIC })
  visibility: ArticleVisibility;

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.DRAFT })
  status: ArticleStatus;

  @Column({ name: 'helpful_count', type: 'int', default: 0 })
  helpfulCount: number;

  @Column({ name: 'not_helpful_count', type: 'int', default: 0 })
  notHelpfulCount: number;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
