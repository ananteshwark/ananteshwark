import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceOrderStatus, MaintenanceOrderType } from './entities/maintenance-order.entity';
import { BreakdownStatus } from './entities/breakdown-notification.entity';

/**
 * Maintenance orders: numbering, the OPEN → IN_PROGRESS → COMPLETED
 * lifecycle, and breakdown notifications converting to orders exactly once.
 */
describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let equipmentRepo: any, planRepo: any, orderRepo: any, breakdownRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 4 }),
    })),
  });

  beforeEach(() => {
    equipmentRepo = mockRepo(); planRepo = mockRepo(); orderRepo = mockRepo(); breakdownRepo = mockRepo();
    service = new MaintenanceService(equipmentRepo, planRepo, orderRepo, breakdownRepo);
  });

  it('createOrder numbers orders sequentially per tenant', async () => {
    await service.createOrder('t1', { description: 'grease bearings' } as any);
    expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({ orderNumber: 'MO-000005' }));
  });

  it('startOrder requires OPEN and stamps the actual start date', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', status: MaintenanceOrderStatus.COMPLETED });
    await expect(service.startOrder('t1', 'o1')).rejects.toThrow(BadRequestException);

    orderRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', status: MaintenanceOrderStatus.OPEN });
    const o = await service.startOrder('t1', 'o1');
    expect(o.status).toBe(MaintenanceOrderStatus.IN_PROGRESS);
    expect(o.actualStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('completeOrder requires IN_PROGRESS and records labor hours', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', status: MaintenanceOrderStatus.OPEN });
    await expect(service.completeOrder('t1', 'o1', { actualEndDate: '2026-07-04' } as any)).rejects.toThrow(BadRequestException);

    orderRepo.findOne.mockResolvedValue({ id: 'o1', tenantId: 't1', status: MaintenanceOrderStatus.IN_PROGRESS });
    const o = await service.completeOrder('t1', 'o1', { actualEndDate: '2026-07-04', laborHours: 3.5 } as any);
    expect(o.status).toBe(MaintenanceOrderStatus.COMPLETED);
    expect(o.laborHours).toBe(3.5);
  });

  it('createOrderFromBreakdown creates a BREAKDOWN order and assigns the notification once', async () => {
    const notification: any = {
      id: 'n1', tenantId: 't1', equipmentId: 'eq1', description: 'motor failure', status: BreakdownStatus.OPEN,
    };
    breakdownRepo.findOne.mockResolvedValue(notification);
    const order = await service.createOrderFromBreakdown('t1', 'n1');
    expect(order.type).toBe(MaintenanceOrderType.BREAKDOWN);
    expect(order.equipmentId).toBe('eq1');
    expect(notification.status).toBe(BreakdownStatus.ASSIGNED);
    expect(notification.maintenanceOrderId).toBe(order.id);

    // a second conversion attempt is rejected
    await expect(service.createOrderFromBreakdown('t1', 'n1')).rejects.toThrow(BadRequestException);
  });

  it('lookups are tenant-scoped 404s', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.startOrder('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'x' } });
  });
});
