import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeedGroup } from './entities/feed-group.entity';

@Injectable()
export class FeedGroupService {
  constructor(
    @InjectRepository(FeedGroup) private readonly groupRepo: Repository<FeedGroup>,
  ) {}

  async createGroup(
    tenantId: string, ownerUserId: string,
    dto: { name: string; description?: string; moderated?: boolean },
  ): Promise<FeedGroup> {
    if (!dto.name?.trim()) throw new BadRequestException('Group name is required');
    return this.groupRepo.save(this.groupRepo.create({
      tenantId,
      name: dto.name.trim(),
      description: dto.description ?? null,
      ownerUserId,
      memberUserIds: [ownerUserId],
      moderated: dto.moderated ?? false,
    }));
  }

  async listGroups(tenantId: string, memberUserId?: string): Promise<FeedGroup[]> {
    const groups = await this.groupRepo.find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
    if (!memberUserId) return groups;
    return groups.filter((g) => g.memberUserIds.includes(memberUserId));
  }

  async getGroup(tenantId: string, id: string): Promise<FeedGroup> {
    const group = await this.groupRepo.findOne({ where: { id, tenantId } });
    if (!group) throw new NotFoundException(`Group ${id} not found`);
    return group;
  }

  async join(tenantId: string, id: string, userId: string): Promise<FeedGroup> {
    const group = await this.getGroup(tenantId, id);
    if (!group.isActive) throw new BadRequestException('This group is no longer active');
    if (!group.memberUserIds.includes(userId)) {
      group.memberUserIds = [...group.memberUserIds, userId];
      await this.groupRepo.save(group);
    }
    return group;
  }

  async leave(tenantId: string, id: string, userId: string): Promise<FeedGroup> {
    const group = await this.getGroup(tenantId, id);
    if (userId === group.ownerUserId) {
      throw new BadRequestException('The group owner cannot leave — archive the group instead');
    }
    group.memberUserIds = group.memberUserIds.filter((u) => u !== userId);
    return this.groupRepo.save(group);
  }

  async archive(tenantId: string, id: string, userId: string): Promise<FeedGroup> {
    const group = await this.getGroup(tenantId, id);
    if (group.ownerUserId !== userId) throw new ForbiddenException('Only the group owner can archive it');
    group.isActive = false;
    return this.groupRepo.save(group);
  }

  /** Whether a member's post to this group should be held for moderation. */
  requiresModeration(group: FeedGroup, authorUserId: string): boolean {
    return group.moderated && authorUserId !== group.ownerUserId;
  }

  isMember(group: FeedGroup, userId: string): boolean {
    return group.memberUserIds.includes(userId);
  }
}
