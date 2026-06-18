import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepository: Repository<NotificationTemplate>,
  ) {}

  async create(data: {
    tenantId: string;
    userId: string;
    type?: NotificationType;
    title: string;
    body: string;
    data?: any;
  }): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...data,
      type: data.type || NotificationType.IN_APP,
    });
    return this.notificationRepository.save(notification);
  }

  async getUserNotifications(
    userId: string,
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<Notification>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.notificationRepository.findAndCount({
      where: { userId, tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: { userId, tenantId, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) return null;
    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, tenantId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected || 0 };
  }

  async sendInApp(
    tenantId: string,
    userId: string,
    title: string,
    body: string,
    data?: any,
  ): Promise<Notification> {
    return this.create({ tenantId, userId, type: NotificationType.IN_APP, title, body, data });
  }

  async getTemplates(tenantId?: string): Promise<NotificationTemplate[]> {
    return this.templateRepository
      .createQueryBuilder('template')
      .where('template.tenantId IS NULL OR template.tenantId = :tenantId', { tenantId })
      .getMany();
  }
}
