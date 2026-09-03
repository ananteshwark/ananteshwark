import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { MilestoneStatus } from './entities/milestone.entity';

/**
 * Projects: the summary aggregation (task counts, hours, expenses), the
 * dashboard, milestone completion stamping, and project-scoped child
 * lookups (a task from another project 404s even in the same tenant).
 */
describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepo: any, memberRepo: any, taskRepo: any, expenseRepo: any, timeEntryRepo: any, milestoneRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  });

  const sumQb = (total: string) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ total }),
    getCount: jest.fn().mockResolvedValue(3),
  });

  beforeEach(() => {
    projectRepo = mockRepo(); memberRepo = mockRepo(); taskRepo = mockRepo();
    expenseRepo = mockRepo(); timeEntryRepo = mockRepo(); milestoneRepo = mockRepo();
    service = new ProjectsService(projectRepo, memberRepo, taskRepo, expenseRepo, timeEntryRepo, milestoneRepo);
  });

  it('getProjectSummary aggregates task counts, hours and expenses', async () => {
    projectRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', name: 'Apollo' });
    taskRepo.count.mockResolvedValueOnce(12).mockResolvedValueOnce(7); // total, done
    timeEntryRepo.createQueryBuilder.mockReturnValue(sumQb('42.5'));
    expenseRepo.createQueryBuilder.mockReturnValue(sumQb('1234.56'));
    const s = await service.getProjectSummary('t1', 'p1');
    expect(s.summary).toEqual({
      totalTasks: 12, doneTasks: 7, totalHoursLogged: 42.5, totalExpenses: 1234.56,
    });
  });

  it('getDashboard counts active projects and open tasks due this week', async () => {
    projectRepo.count.mockResolvedValue(4);
    taskRepo.createQueryBuilder.mockReturnValue(sumQb('0'));
    const d = await service.getDashboard('t1');
    expect(d).toEqual({ activeProjects: 4, tasksDueThisWeek: 3 });
  });

  it('completeMilestone stamps status + completion date', async () => {
    milestoneRepo.findOne.mockResolvedValue({ id: 'm1', tenantId: 't1', projectId: 'p1', status: MilestoneStatus.PENDING });
    const m = await service.completeMilestone('t1', 'p1', 'm1');
    expect(m.status).toBe(MilestoneStatus.COMPLETED);
    expect(m.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('child lookups are scoped to the project, not just the tenant', async () => {
    milestoneRepo.findOne.mockResolvedValue(null);
    await expect(service.completeMilestone('t1', 'other-project', 'm1')).rejects.toThrow(NotFoundException);
    expect(milestoneRepo.findOne).toHaveBeenCalledWith({ where: { id: 'm1', tenantId: 't1', projectId: 'other-project' } });

    taskRepo.findOne.mockResolvedValue(null);
    await expect(service.findTask('t1', 'p9', 'task1')).rejects.toThrow(NotFoundException);
    expect(taskRepo.findOne).toHaveBeenCalledWith({ where: { id: 'task1', tenantId: 't1', projectId: 'p9' } });
  });

  it('project lookups are tenant-scoped 404s', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    await expect(service.findProject('t2', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
