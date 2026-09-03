import { NotificationsService } from './notifications.service';
import { NotificationType } from './entities/notification.entity';

/**
 * Notifications: creation defaults, unread counting, read-marking scoped to
 * the owning user, and bulk mark-all.
 */
describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: any, templateRepo: any;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => ({ id: 'n1', isRead: false, ...x })),
      save: jest.fn((x) => Promise.resolve(x)),
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(3),
      update: jest.fn().mockResolvedValue({ affected: 5 }),
    };
    templateRepo = { createQueryBuilder: jest.fn() };
    service = new NotificationsService(repo, templateRepo);
  });

  it('create defaults the type to IN_APP', async () => {
    const n = await service.create({ tenantId: 't1', userId: 'u1', title: 'Hi', body: 'there' });
    expect(n.type).toBe(NotificationType.IN_APP);
  });

  it('getUnreadCount counts only unread rows for the user + tenant', async () => {
    const r = await service.getUnreadCount('u1', 't1');
    expect(r).toEqual({ count: 3 });
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: 'u1', tenantId: 't1', isRead: false } });
  });

  it("markAsRead only touches the owner's notification and stamps readAt", async () => {
    repo.findOne.mockResolvedValue({ id: 'n1', userId: 'u1', isRead: false });
    const n = await service.markAsRead('n1', 'u1');
    expect(n.isRead).toBe(true);
    expect(n.readAt).toBeInstanceOf(Date);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'n1', userId: 'u1' } });
  });

  it("markAsRead returns null for another user's notification", async () => {
    repo.findOne.mockResolvedValue(null);
    expect(await service.markAsRead('n1', 'intruder')).toBeNull();
  });

  it('markAllAsRead reports how many were updated', async () => {
    const r = await service.markAllAsRead('u1', 't1');
    expect(r).toEqual({ updated: 5 });
    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'u1', tenantId: 't1', isRead: false },
      expect.objectContaining({ isRead: true }),
    );
  });
});
