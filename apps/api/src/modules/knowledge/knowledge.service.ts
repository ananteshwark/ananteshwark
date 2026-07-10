import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbCategory, KbArticle, KbArticleStatus, EmailIntake, EmailIntakeStatus } from './entities/knowledge.entity';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { AutomationService } from '../automation/automation.service';

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200) || 'article';
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KbCategory) private readonly categoryRepo: Repository<KbCategory>,
    @InjectRepository(KbArticle) private readonly articleRepo: Repository<KbArticle>,
    @InjectRepository(EmailIntake) private readonly intakeRepo: Repository<EmailIntake>,
    @Optional() private readonly helpdesk?: HelpdeskService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Categories ───────────────────────────────────────────────

  async createCategory(tenantId: string, dto: { name: string; description?: string; parentId?: string }): Promise<KbCategory> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const existing = await this.categoryRepo.findOne({ where: { tenantId, name: dto.name.trim() } });
    if (existing) throw new BadRequestException(`Category "${dto.name}" already exists`);
    return this.categoryRepo.save(this.categoryRepo.create({ tenantId, name: dto.name.trim(), description: dto.description ?? null, parentId: dto.parentId ?? null }));
  }

  listCategories(tenantId: string): Promise<KbCategory[]> {
    return this.categoryRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  // ─── Articles ─────────────────────────────────────────────────

  async createArticle(tenantId: string, userId: string, dto: { title: string; body: string; categoryId?: string; tags?: string[] }): Promise<KbArticle> {
    if (!dto.title?.trim() || !dto.body?.trim()) throw new BadRequestException('title and body are required');
    const slug = await this.uniqueSlug(tenantId, dto.title);
    return this.articleRepo.save(this.articleRepo.create({
      tenantId, title: dto.title.trim(), slug, body: dto.body,
      categoryId: dto.categoryId ?? null, tags: dto.tags ?? [], status: KbArticleStatus.DRAFT, version: 1,
      authorUserId: userId,
    }));
  }

  private async uniqueSlug(tenantId: string, title: string): Promise<string> {
    const base = slugify(title);
    let slug = base;
    let n = 1;
    while (await this.articleRepo.findOne({ where: { tenantId, slug } })) slug = `${base}-${++n}`;
    return slug;
  }

  async getArticle(tenantId: string, id: string): Promise<KbArticle> {
    const article = await this.articleRepo.findOne({ where: { id, tenantId } });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    return article;
  }

  async updateArticle(tenantId: string, id: string, dto: { title?: string; body?: string; categoryId?: string; tags?: string[] }): Promise<KbArticle> {
    const article = await this.getArticle(tenantId, id);
    if (dto.title !== undefined) article.title = dto.title.trim();
    if (dto.body !== undefined) article.body = dto.body;
    if (dto.categoryId !== undefined) article.categoryId = dto.categoryId;
    if (dto.tags !== undefined) article.tags = dto.tags;
    // Editing a published article mints a new version and reverts to DRAFT.
    if (article.status === KbArticleStatus.PUBLISHED) {
      article.status = KbArticleStatus.DRAFT;
      article.version += 1;
      article.publishedAt = null;
    }
    return this.articleRepo.save(article);
  }

  async publish(tenantId: string, id: string): Promise<KbArticle> {
    const article = await this.getArticle(tenantId, id);
    if (article.status === KbArticleStatus.PUBLISHED) throw new BadRequestException('Article is already published');
    article.status = KbArticleStatus.PUBLISHED;
    article.publishedAt = new Date();
    const saved = await this.articleRepo.save(article);
    await this.automation?.emit(tenantId, 'kb.article_published', { articleId: saved.id, title: saved.title, version: saved.version });
    return saved;
  }

  async archive(tenantId: string, id: string): Promise<KbArticle> {
    const article = await this.getArticle(tenantId, id);
    article.status = KbArticleStatus.ARCHIVED;
    return this.articleRepo.save(article);
  }

  listArticles(tenantId: string, filter: { status?: KbArticleStatus; categoryId?: string }): Promise<KbArticle[]> {
    const where: any = { tenantId };
    if (filter.status) where.status = filter.status;
    if (filter.categoryId) where.categoryId = filter.categoryId;
    return this.articleRepo.find({ where, order: { updatedAt: 'DESC' } });
  }

  async recordView(tenantId: string, id: string): Promise<KbArticle> {
    const article = await this.getArticle(tenantId, id);
    article.viewCount += 1;
    return this.articleRepo.save(article);
  }

  async vote(tenantId: string, id: string, helpful: boolean): Promise<KbArticle> {
    const article = await this.getArticle(tenantId, id);
    if (helpful) article.helpfulCount += 1; else article.notHelpfulCount += 1;
    return this.articleRepo.save(article);
  }

  /**
   * Rank published articles for a query: title matches weigh most, then tags,
   * then body; helpful votes and views break ties. Used for both search and
   * ticket-deflection suggestions.
   */
  async search(tenantId: string, query: string, limit = 10): Promise<Array<{ article: KbArticle; score: number }>> {
    const q = (query ?? '').toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const articles = await this.articleRepo.find({ where: { tenantId, status: KbArticleStatus.PUBLISHED } });
    const scored = articles.map((article) => {
      const title = article.title.toLowerCase();
      const body = article.body.toLowerCase();
      const tags = article.tags.map((t) => t.toLowerCase());
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 5;
        if (tags.some((tag) => tag.includes(t))) score += 3;
        if (body.includes(t)) score += 1;
      }
      if (score > 0) score += Math.min(2, article.helpfulCount * 0.1) + Math.min(1, article.viewCount * 0.001);
      return { article, score: Math.round(score * 100) / 100 };
    }).filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  suggestForQuery(tenantId: string, query: string): Promise<Array<{ article: KbArticle; score: number }>> {
    return this.search(tenantId, query, 5);
  }

  // ─── Email-to-ticket intake ───────────────────────────────────

  async ingestEmail(tenantId: string, dto: { messageId: string; threadId?: string; fromEmail: string; subject: string; body?: string; receivedAt?: string }): Promise<{ intake: EmailIntake; duplicate: boolean }> {
    if (!dto.messageId || !dto.fromEmail?.trim()) throw new BadRequestException('messageId and fromEmail are required');
    const existing = await this.intakeRepo.findOne({ where: { tenantId, messageId: dto.messageId } });
    if (existing) return { intake: existing, duplicate: true };
    const intake = await this.intakeRepo.save(this.intakeRepo.create({
      tenantId, messageId: dto.messageId, threadId: dto.threadId ?? null,
      fromEmail: dto.fromEmail.trim(), subject: dto.subject ?? '(no subject)', body: dto.body ?? null,
      status: EmailIntakeStatus.NEW, receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
    }));
    return { intake, duplicate: false };
  }

  listIntakes(tenantId: string, status?: EmailIntakeStatus): Promise<EmailIntake[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.intakeRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Convert an intake into a helpdesk case and link them. */
  async convertToTicket(tenantId: string, intakeId: string, createdByUserId: string, opts?: { employeeId?: string }): Promise<EmailIntake> {
    const intake = await this.intakeRepo.findOne({ where: { id: intakeId, tenantId } });
    if (!intake) throw new NotFoundException(`Email intake ${intakeId} not found`);
    if (intake.status !== EmailIntakeStatus.NEW) throw new BadRequestException('Only NEW intakes can be converted');
    if (!this.helpdesk) throw new BadRequestException('Helpdesk service is unavailable');
    const kase = await this.helpdesk.createCase(tenantId, createdByUserId, {
      subject: intake.subject, description: intake.body ?? '', employeeId: opts?.employeeId,
    });
    intake.status = EmailIntakeStatus.CONVERTED;
    intake.caseId = kase.id;
    intake.caseNumber = kase.caseNumber;
    return this.intakeRepo.save(intake);
  }

  async ignoreIntake(tenantId: string, intakeId: string): Promise<EmailIntake> {
    const intake = await this.intakeRepo.findOne({ where: { id: intakeId, tenantId } });
    if (!intake) throw new NotFoundException(`Email intake ${intakeId} not found`);
    intake.status = EmailIntakeStatus.IGNORED;
    return this.intakeRepo.save(intake);
  }
}
