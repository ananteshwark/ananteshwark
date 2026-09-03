import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingStatus } from './entities/onboarding-plan.entity';
import { TaskStatus } from './entities/onboarding-task.entity';

/**
 * Onboarding: single-default template invariant, plan creation materializes
 * template tasks with due dates, and task completion recalculates plan
 * progress/status.
 */
describe('OnboardingService', () => {
  let service: OnboardingService;
  let templateRepo: any, planRepo: any, taskRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(Array.isArray(x) ? x : { id: 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  });

  beforeEach(() => {
    templateRepo = mockRepo(); planRepo = mockRepo(); taskRepo = mockRepo();
    service = new OnboardingService(templateRepo, planRepo, taskRepo);
  });

  it('creating a default template demotes the previous default', async () => {
    await service.createTemplate('t1', { name: 'Standard', isDefault: true } as any);
    expect(templateRepo.update).toHaveBeenCalledWith({ tenantId: 't1', isDefault: true }, { isDefault: false });

    templateRepo.update.mockClear();
    await service.createTemplate('t1', { name: 'Alt', isDefault: false } as any);
    expect(templateRepo.update).not.toHaveBeenCalled();
  });

  it('createPlan materializes template tasks with dueAfterDays offsets', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'tpl1', tenantId: 't1',
      tasks: [{ title: 'Laptop', dueAfterDays: 2 }, { title: 'Intro', category: 'HR' }],
    });
    await service.createPlan('t1', { employeeId: 'e1', templateId: 'tpl1', startDate: '2026-07-01' } as any);
    expect(taskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Laptop', dueDate: '2026-07-03', status: TaskStatus.PENDING }));
    expect(taskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Intro', dueDate: '2026-07-08' })); // default 7 days
    expect(taskRepo.save).toHaveBeenCalled();
  });

  it('completing tasks recalculates plan percent and flips status', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'task1', tenantId: 't1', planId: 'p1', status: TaskStatus.PENDING });
    taskRepo.find.mockResolvedValue([
      { status: TaskStatus.COMPLETED }, { status: TaskStatus.SKIPPED },
      { status: TaskStatus.PENDING }, { status: TaskStatus.PENDING },
    ]);
    const t = await service.updateTaskStatus('t1', 'task1', { status: TaskStatus.COMPLETED } as any);
    expect(t.completedAt).toBeInstanceOf(Date);
    expect(planRepo.update).toHaveBeenCalledWith(
      { id: 'p1', tenantId: 't1' },
      { completionPercent: 50, status: OnboardingStatus.IN_PROGRESS });
  });

  it('all tasks done marks the plan COMPLETED at 100%', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'task1', tenantId: 't1', planId: 'p1' });
    taskRepo.find.mockResolvedValue([{ status: TaskStatus.COMPLETED }, { status: TaskStatus.SKIPPED }]);
    await service.updateTaskStatus('t1', 'task1', { status: TaskStatus.COMPLETED } as any);
    expect(planRepo.update).toHaveBeenCalledWith(
      { id: 'p1', tenantId: 't1' },
      { completionPercent: 100, status: OnboardingStatus.COMPLETED });
  });

  it('getEmployeeOnboarding 404s when the employee has no plan', async () => {
    await expect(service.getEmployeeOnboarding('t1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
