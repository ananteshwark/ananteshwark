import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KbArticleStatus, EmailIntakeStatus } from './entities/knowledge.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let categoryRepo: any, articleRepo: any, intakeRepo: any, helpdesk: any, automation: any;

  beforeEach(() => {
    categoryRepo = mockRepo(); articleRepo = mockRepo(); intakeRepo = mockRepo();
    helpdesk = { createCase: jest.fn().mockResolvedValue({ id: 'case1', caseNumber: 'HD-100' }) };
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new KnowledgeService(categoryRepo, articleRepo, intakeRepo, helpdesk, automation);
  });

  describe('articles', () => {
    it('creates a DRAFT article with a slug', async () => {
      articleRepo.findOne.mockResolvedValue(null);
      const a = await service.createArticle('t1', 'u1', { title: 'Reset Your Password!', body: 'Steps...' });
      expect(a).toMatchObject({ slug: 'reset-your-password', status: KbArticleStatus.DRAFT, version: 1 });
    });

    it('publishes an article and emits kb.article_published', async () => {
      articleRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', title: 'X', status: KbArticleStatus.DRAFT, version: 1 });
      const pub = await service.publish('t1', 'a1');
      expect(pub.status).toBe(KbArticleStatus.PUBLISHED);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'kb.article_published', expect.objectContaining({ articleId: 'a1' }));
    });

    it('editing a published article bumps the version and reverts to DRAFT', async () => {
      articleRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: KbArticleStatus.PUBLISHED, version: 2, publishedAt: new Date() });
      const upd = await service.updateArticle('t1', 'a1', { body: 'new' });
      expect(upd.version).toBe(3);
      expect(upd.status).toBe(KbArticleStatus.DRAFT);
      expect(upd.publishedAt).toBeNull();
    });

    it('records votes', async () => {
      articleRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', helpfulCount: 0, notHelpfulCount: 0 });
      const a = await service.vote('t1', 'a1', true);
      expect(a.helpfulCount).toBe(1);
    });
  });

  describe('search / deflection', () => {
    it('ranks title matches above body matches, published only', async () => {
      articleRepo.find.mockResolvedValue([
        { id: 'a1', title: 'Password reset guide', body: 'x', tags: [], helpfulCount: 0, viewCount: 0, status: KbArticleStatus.PUBLISHED },
        { id: 'a2', title: 'Onboarding', body: 'contains password once', tags: [], helpfulCount: 0, viewCount: 0, status: KbArticleStatus.PUBLISHED },
        { id: 'a3', title: 'Unrelated', body: 'nothing', tags: [], helpfulCount: 0, viewCount: 0, status: KbArticleStatus.PUBLISHED },
      ]);
      const results = await service.search('t1', 'password');
      expect(results.map((r) => r.article.id)).toEqual(['a1', 'a2']);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('returns nothing for a blank query', async () => {
      expect(await service.search('t1', '   ')).toEqual([]);
    });
  });

  describe('email-to-ticket', () => {
    it('ingests an email and dedupes by message id', async () => {
      intakeRepo.findOne.mockResolvedValueOnce(null);
      const first = await service.ingestEmail('t1', { messageId: 'm1', fromEmail: 'a@b.com', subject: 'Help' });
      expect(first.duplicate).toBe(false);

      intakeRepo.findOne.mockResolvedValueOnce({ id: 'i1', messageId: 'm1' });
      const dup = await service.ingestEmail('t1', { messageId: 'm1', fromEmail: 'a@b.com', subject: 'Help' });
      expect(dup.duplicate).toBe(true);
    });

    it('converts a NEW intake into a helpdesk case and links it', async () => {
      intakeRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', status: EmailIntakeStatus.NEW, subject: 'Help', body: 'text' });
      const conv = await service.convertToTicket('t1', 'i1', 'u1');
      expect(helpdesk.createCase).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({ subject: 'Help' }));
      expect(conv).toMatchObject({ status: EmailIntakeStatus.CONVERTED, caseId: 'case1', caseNumber: 'HD-100' });
    });

    it('refuses to convert an already-converted intake', async () => {
      intakeRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', status: EmailIntakeStatus.CONVERTED });
      await expect(service.convertToTicket('t1', 'i1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });
});
