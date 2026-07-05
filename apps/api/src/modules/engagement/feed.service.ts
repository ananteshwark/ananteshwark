import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { FeedPost, FeedComment, FeedPostType, PollOption } from './entities/feed.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(FeedPost) private readonly postRepo: Repository<FeedPost>,
    @InjectRepository(FeedComment) private readonly commentRepo: Repository<FeedComment>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async createPost(
    tenantId: string,
    author: { userId: string; name: string },
    dto: { type?: FeedPostType; title?: string; body: string; pollOptions?: PollOption[] },
  ): Promise<FeedPost> {
    if (!dto.body?.trim()) throw new BadRequestException('Post body is required');
    const type = dto.type === FeedPostType.POLL ? FeedPostType.POLL : FeedPostType.POST;
    let pollOptions: PollOption[] | null = null;
    if (type === FeedPostType.POLL) {
      const options = (dto.pollOptions ?? []).filter(o => o.text?.trim());
      if (options.length < 2) throw new BadRequestException('A poll needs at least two options');
      pollOptions = options.map(o => ({ id: o.id || randomUUID(), text: o.text.trim() }));
    }
    const post = this.postRepo.create({
      tenantId,
      authorUserId: author.userId,
      authorName: author.name,
      type,
      title: dto.title?.trim() || null,
      body: dto.body.trim(),
      pollOptions,
      pollVotes: {},
      likedBy: [],
      commentCount: 0,
      pinned: false,
    });
    return this.postRepo.save(post);
  }

  async createAnnouncement(
    tenantId: string,
    author: { userId: string; name: string },
    dto: { title: string; body: string; pinned?: boolean },
  ): Promise<FeedPost> {
    if (!dto.title?.trim()) throw new BadRequestException('Announcement title is required');
    if (!dto.body?.trim()) throw new BadRequestException('Announcement body is required');
    const post = this.postRepo.create({
      tenantId,
      authorUserId: author.userId,
      authorName: author.name,
      type: FeedPostType.ANNOUNCEMENT,
      title: dto.title.trim(),
      body: dto.body.trim(),
      pollOptions: null,
      pollVotes: {},
      likedBy: [],
      commentCount: 0,
      pinned: dto.pinned ?? false,
    });
    const saved = await this.postRepo.save(post);
    await this.automation?.emit(tenantId, 'feed.announcement_posted', {
      postId: saved.id, title: saved.title, authorName: saved.authorName,
    });
    return saved;
  }

  async listFeed(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<FeedPost>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.postRepo.findAndCount({
      where: { tenantId },
      order: { pinned: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  private async getPost(tenantId: string, id: string): Promise<FeedPost> {
    const post = await this.postRepo.findOne({ where: { id, tenantId } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async toggleLike(tenantId: string, postId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.getPost(tenantId, postId);
    const likedBy = post.likedBy ?? [];
    const liked = likedBy.includes(userId);
    post.likedBy = liked ? likedBy.filter(u => u !== userId) : [...likedBy, userId];
    await this.postRepo.save(post);
    return { liked: !liked, likeCount: post.likedBy.length };
  }

  async vote(tenantId: string, postId: string, userId: string, optionId: string) {
    const post = await this.getPost(tenantId, postId);
    if (post.type !== FeedPostType.POLL || !post.pollOptions) {
      throw new BadRequestException('This post is not a poll');
    }
    if (!post.pollOptions.some(o => o.id === optionId)) {
      throw new BadRequestException('Unknown poll option');
    }
    post.pollVotes = { ...(post.pollVotes ?? {}), [userId]: optionId };
    await this.postRepo.save(post);
    return this.pollResults(post);
  }

  pollResults(post: FeedPost) {
    const votes = Object.values(post.pollVotes ?? {});
    return {
      totalVotes: votes.length,
      options: (post.pollOptions ?? []).map(o => ({
        ...o,
        votes: votes.filter(v => v === o.id).length,
      })),
    };
  }

  async addComment(
    tenantId: string, postId: string, author: { userId: string; name: string }, body: string,
  ): Promise<FeedComment> {
    if (!body?.trim()) throw new BadRequestException('Comment body is required');
    const post = await this.getPost(tenantId, postId);
    const comment = this.commentRepo.create({
      tenantId, postId, authorUserId: author.userId, authorName: author.name, body: body.trim(),
    });
    const saved = await this.commentRepo.save(comment);
    post.commentCount = (post.commentCount ?? 0) + 1;
    await this.postRepo.save(post);
    return saved;
  }

  async listComments(tenantId: string, postId: string): Promise<FeedComment[]> {
    return this.commentRepo.find({ where: { tenantId, postId }, order: { createdAt: 'ASC' } });
  }

  async setPinned(tenantId: string, postId: string, pinned: boolean): Promise<FeedPost> {
    const post = await this.getPost(tenantId, postId);
    post.pinned = pinned;
    return this.postRepo.save(post);
  }

  /** Authors may delete their own posts; moderators (canModerate) may delete any. */
  async deletePost(tenantId: string, postId: string, userId: string, canModerate: boolean): Promise<void> {
    const post = await this.getPost(tenantId, postId);
    if (!canModerate && post.authorUserId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }
    await this.commentRepo.delete({ tenantId, postId });
    await this.postRepo.delete({ id: postId, tenantId });
  }
}
