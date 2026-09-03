import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, ProjectStatus } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { Task, TaskStatus } from './entities/task.entity';
import { ProjectExpense } from './entities/project-expense.entity';
import { ProjectTimeEntry } from './entities/project-time-entry.entity';
import { Milestone, MilestoneStatus } from './entities/milestone.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(ProjectExpense)
    private readonly expenseRepo: Repository<ProjectExpense>,
    @InjectRepository(ProjectTimeEntry)
    private readonly timeEntryRepo: Repository<ProjectTimeEntry>,
    @InjectRepository(Milestone)
    private readonly milestoneRepo: Repository<Milestone>,
  ) {}

  // ─── Projects ─────────────────────────────────────────────────

  async createProject(tenantId: string, dto: Partial<Project>): Promise<Project> {
    const entity = this.projectRepo.create({ ...dto, tenantId });
    return this.projectRepo.save(entity);
  }

  async findProjects(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { status?: ProjectStatus },
  ): Promise<PaginatedResponseDto<Project>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('p.status = :status', { status: filters.status });
    qb.orderBy('p.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findProject(tenantId: string, id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id, tenantId } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async updateProject(tenantId: string, id: string, dto: Partial<Project>): Promise<Project> {
    const project = await this.findProject(tenantId, id);
    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async deleteProject(tenantId: string, id: string): Promise<void> {
    const project = await this.findProject(tenantId, id);
    await this.projectRepo.remove(project);
  }

  async getProjectSummary(tenantId: string, id: string): Promise<any> {
    const project = await this.findProject(tenantId, id);

    const [totalTasks, doneTasks, hoursResult, expenseResult] = await Promise.all([
      this.taskRepo.count({ where: { projectId: id, tenantId } }),
      this.taskRepo.count({ where: { projectId: id, tenantId, status: TaskStatus.DONE } }),
      this.timeEntryRepo
        .createQueryBuilder('t')
        .select('SUM(t.hours)', 'total')
        .where('t.projectId = :id AND t.tenantId = :tenantId', { id, tenantId })
        .getRawOne<{ total: string }>(),
      this.expenseRepo
        .createQueryBuilder('e')
        .select('SUM(e.amount)', 'total')
        .where('e.projectId = :id AND e.tenantId = :tenantId', { id, tenantId })
        .getRawOne<{ total: string }>(),
    ]);

    return {
      ...project,
      summary: {
        totalTasks,
        doneTasks,
        totalHoursLogged: parseFloat(hoursResult?.total ?? '0') || 0,
        totalExpenses: parseFloat(expenseResult?.total ?? '0') || 0,
      },
    };
  }

  async getDashboard(tenantId: string): Promise<any> {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const [activeCount, tasksDueThisWeek] = await Promise.all([
      this.projectRepo.count({ where: { tenantId, status: ProjectStatus.ACTIVE } }),
      this.taskRepo
        .createQueryBuilder('t')
        .where('t.tenantId = :tenantId', { tenantId })
        .andWhere('t.dueDate >= :today', { today: todayStr })
        .andWhere('t.dueDate <= :weekEnd', { weekEnd: weekEndStr })
        .andWhere('t.status NOT IN (:...done)', { done: [TaskStatus.DONE, TaskStatus.CANCELLED] })
        .getCount(),
    ]);

    return { activeProjects: activeCount, tasksDueThisWeek };
  }

  // ─── Members ──────────────────────────────────────────────────

  async addMember(tenantId: string, projectId: string, dto: Partial<ProjectMember>): Promise<ProjectMember> {
    await this.findProject(tenantId, projectId);
    const entity = this.memberRepo.create({ ...dto, tenantId, projectId });
    return this.memberRepo.save(entity);
  }

  async findMembers(tenantId: string, projectId: string): Promise<ProjectMember[]> {
    return this.memberRepo.find({ where: { tenantId, projectId }, order: { createdAt: 'ASC' } });
  }

  async updateMember(tenantId: string, projectId: string, id: string, dto: Partial<ProjectMember>): Promise<ProjectMember> {
    const member = await this.memberRepo.findOne({ where: { id, tenantId, projectId } });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    Object.assign(member, dto);
    return this.memberRepo.save(member);
  }

  async removeMember(tenantId: string, projectId: string, id: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { id, tenantId, projectId } });
    if (!member) throw new NotFoundException(`Member ${id} not found`);
    await this.memberRepo.remove(member);
  }

  // ─── Tasks ────────────────────────────────────────────────────

  async createTask(tenantId: string, projectId: string, dto: Partial<Task>): Promise<Task> {
    await this.findProject(tenantId, projectId);
    const entity = this.taskRepo.create({ ...dto, tenantId, projectId });
    return this.taskRepo.save(entity);
  }

  async findTasks(
    tenantId: string,
    projectId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<Task>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.taskRepo.findAndCount({
      where: { tenantId, projectId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findTask(tenantId: string, projectId: string, id: string): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id, tenantId, projectId } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async updateTask(tenantId: string, projectId: string, id: string, dto: Partial<Task>): Promise<Task> {
    const task = await this.findTask(tenantId, projectId, id);
    if (dto.status === TaskStatus.DONE && !task.completedAt) {
      (dto as any).completedAt = new Date();
    }
    Object.assign(task, dto);
    return this.taskRepo.save(task);
  }

  async deleteTask(tenantId: string, projectId: string, id: string): Promise<void> {
    const task = await this.findTask(tenantId, projectId, id);
    await this.taskRepo.remove(task);
  }

  // ─── Time Entries ─────────────────────────────────────────────

  async createTimeEntry(tenantId: string, projectId: string, dto: Partial<ProjectTimeEntry>): Promise<ProjectTimeEntry> {
    await this.findProject(tenantId, projectId);
    const entity = this.timeEntryRepo.create({ ...dto, tenantId, projectId });
    return this.timeEntryRepo.save(entity);
  }

  async findTimeEntries(
    tenantId: string,
    projectId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<ProjectTimeEntry>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.timeEntryRepo.findAndCount({
      where: { tenantId, projectId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findTimeEntry(tenantId: string, projectId: string, id: string): Promise<ProjectTimeEntry> {
    const entry = await this.timeEntryRepo.findOne({ where: { id, tenantId, projectId } });
    if (!entry) throw new NotFoundException(`Time entry ${id} not found`);
    return entry;
  }

  async updateTimeEntry(tenantId: string, projectId: string, id: string, dto: Partial<ProjectTimeEntry>): Promise<ProjectTimeEntry> {
    const entry = await this.findTimeEntry(tenantId, projectId, id);
    Object.assign(entry, dto);
    return this.timeEntryRepo.save(entry);
  }

  async deleteTimeEntry(tenantId: string, projectId: string, id: string): Promise<void> {
    const entry = await this.findTimeEntry(tenantId, projectId, id);
    await this.timeEntryRepo.remove(entry);
  }

  // ─── Expenses ─────────────────────────────────────────────────

  async createProjectExpense(tenantId: string, projectId: string, dto: Partial<ProjectExpense>): Promise<ProjectExpense> {
    await this.findProject(tenantId, projectId);
    const entity = this.expenseRepo.create({ ...dto, tenantId, projectId });
    return this.expenseRepo.save(entity);
  }

  async findProjectExpenses(
    tenantId: string,
    projectId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<ProjectExpense>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.expenseRepo.findAndCount({
      where: { tenantId, projectId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findProjectExpense(tenantId: string, projectId: string, id: string): Promise<ProjectExpense> {
    const expense = await this.expenseRepo.findOne({ where: { id, tenantId, projectId } });
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);
    return expense;
  }

  async updateProjectExpense(tenantId: string, projectId: string, id: string, dto: Partial<ProjectExpense>): Promise<ProjectExpense> {
    const expense = await this.findProjectExpense(tenantId, projectId, id);
    Object.assign(expense, dto);
    return this.expenseRepo.save(expense);
  }

  async deleteProjectExpense(tenantId: string, projectId: string, id: string): Promise<void> {
    const expense = await this.findProjectExpense(tenantId, projectId, id);
    await this.expenseRepo.remove(expense);
  }

  // ─── Milestones ───────────────────────────────────────────────

  async listMilestones(tenantId: string, projectId: string): Promise<Milestone[]> {
    return this.milestoneRepo.find({ where: { tenantId, projectId }, order: { dueDate: 'ASC' } });
  }

  async createMilestone(tenantId: string, projectId: string, dto: Partial<Milestone>): Promise<Milestone> {
    await this.findProject(tenantId, projectId);
    const milestone = this.milestoneRepo.create({ ...dto, tenantId, projectId });
    return this.milestoneRepo.save(milestone);
  }

  async updateMilestone(tenantId: string, projectId: string, id: string, dto: Partial<Milestone>): Promise<Milestone> {
    const milestone = await this.milestoneRepo.findOne({ where: { id, tenantId, projectId } });
    if (!milestone) throw new NotFoundException(`Milestone ${id} not found`);
    Object.assign(milestone, dto);
    return this.milestoneRepo.save(milestone);
  }

  async completeMilestone(tenantId: string, projectId: string, id: string): Promise<Milestone> {
    return this.updateMilestone(tenantId, projectId, id, {
      status: MilestoneStatus.COMPLETED,
      completedDate: new Date().toISOString().split('T')[0],
    });
  }

  async deleteMilestone(tenantId: string, projectId: string, id: string): Promise<void> {
    const milestone = await this.milestoneRepo.findOne({ where: { id, tenantId, projectId } });
    if (!milestone) throw new NotFoundException(`Milestone ${id} not found`);
    await this.milestoneRepo.remove(milestone);
  }
}
