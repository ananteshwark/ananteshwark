import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition, WorkflowStep } from './entities/workflow-definition.entity';
import { WorkflowInstance, WorkflowInstanceStatus } from './entities/workflow-instance.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { AutomationService } from '../automation/automation.service';
import { CreateWorkflowDefinitionDto, StartWorkflowDto, ApproveStepDto } from './dto/workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly definitionRepository: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepository: Repository<WorkflowInstance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly permissionsService: PermissionsService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  /**
   * Whether `userId` is an authorized approver for `step` on `instance`.
   * - `user`    → the approver value is the user's id
   * - `role`    → the user holds a role with that name (active, non-expired)
   * - `manager` → the user is the initiator's direct manager (resolved via Employee)
   * A step with no approvers defined is treated as unrestricted (callers still need
   * the route permission), so we return true only for that explicit empty case.
   */
  private async isAuthorizedApprover(
    instance: WorkflowInstance,
    step: WorkflowStep | undefined,
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const approvers = step?.approvers ?? [];
    if (approvers.length === 0) return true;

    for (const approver of approvers) {
      if (approver.type === 'user' && approver.value === userId) return true;
      if (approver.type === 'role') {
        const roleNames = await this.permissionsService.getUserRoleNames(userId, tenantId);
        if (roleNames.includes(approver.value)) return true;
      }
      if (approver.type === 'manager') {
        const initiatorEmp = await this.employeeRepository.findOne({
          where: { tenantId, userId: instance.initiatorId },
        });
        if (initiatorEmp?.managerId) {
          const managerEmp = await this.employeeRepository.findOne({
            where: { tenantId, id: initiatorEmp.managerId },
          });
          if (managerEmp?.userId && managerEmp.userId === userId) return true;
        }
      }
    }
    return false;
  }

  private async loadActionableInstance(
    instanceId: string,
    stepId: string,
    userId: string,
    tenantId: string,
  ): Promise<{ instance: WorkflowInstance; step: WorkflowStep | undefined }> {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId, tenantId } });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    if (instance.currentStep !== stepId) {
      throw new BadRequestException(`Step ${stepId} is not the current active step`);
    }
    if (instance.initiatorId && instance.initiatorId === userId) {
      throw new ForbiddenException('You cannot approve or reject your own request');
    }
    const definition = await this.definitionRepository.findOne({
      where: { id: instance.definitionId, tenantId },
    });
    const step = definition?.steps?.find(s => s.id === stepId);
    if (!(await this.isAuthorizedApprover(instance, step, userId, tenantId))) {
      throw new ForbiddenException('You are not an authorized approver for this step');
    }
    return { instance, step };
  }

  async createDefinition(
    tenantId: string,
    userId: string | null,
    dto: CreateWorkflowDefinitionDto,
  ): Promise<WorkflowDefinition> {
    const definition = this.definitionRepository.create({
      ...dto,
      steps: dto.steps || [],
      tenantId,
      createdBy: userId,
    });
    return this.definitionRepository.save(definition);
  }

  async getDefinitions(tenantId: string): Promise<WorkflowDefinition[]> {
    return this.definitionRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getDefinitionById(id: string, tenantId: string): Promise<WorkflowDefinition> {
    const definition = await this.definitionRepository.findOne({ where: { id, tenantId } });
    if (!definition) throw new NotFoundException('Workflow definition not found');
    return definition;
  }

  async startWorkflow(
    tenantId: string,
    initiatorId: string,
    dto: StartWorkflowDto,
  ): Promise<WorkflowInstance> {
    const definition = await this.definitionRepository.findOne({
      where: { id: dto.definitionId, tenantId, isActive: true },
    });
    if (!definition) throw new NotFoundException('Workflow definition not found or inactive');

    const firstStep = definition.steps?.[0];
    const instance = this.instanceRepository.create({
      tenantId,
      definitionId: dto.definitionId,
      initiatorId,
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      context: dto.context || {},
      currentStep: firstStep?.id || null,
      status: firstStep ? WorkflowInstanceStatus.IN_PROGRESS : WorkflowInstanceStatus.APPROVED,
      history: [],
    });
    const saved = await this.instanceRepository.save(instance);
    await this.automation?.emit(tenantId, 'workflow.started', {
      instanceId: saved.id,
      definitionId: saved.definitionId,
      definitionName: definition.name,
      initiatorId,
      subjectType: saved.subjectType,
      subjectId: saved.subjectId,
    });
    return saved;
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    userId: string,
    tenantId: string,
    dto: ApproveStepDto,
  ): Promise<WorkflowInstance> {
    const { instance, step: currentStepDef } = await this.loadActionableInstance(
      instanceId,
      stepId,
      userId,
      tenantId,
    );

    instance.history = [
      ...instance.history,
      {
        stepId,
        action: 'approved',
        userId,
        comment: dto.comment,
        timestamp: new Date().toISOString(),
      },
    ];

    const nextStepId = currentStepDef?.onApproveNext;
    if (nextStepId) {
      instance.currentStep = nextStepId;
      instance.status = WorkflowInstanceStatus.IN_PROGRESS;
    } else {
      instance.status = WorkflowInstanceStatus.APPROVED;
      instance.currentStep = null;
    }

    const saved = await this.instanceRepository.save(instance);
    if (saved.status === WorkflowInstanceStatus.APPROVED) {
      await this.automation?.emit(tenantId, 'workflow.approved', {
        instanceId: saved.id,
        definitionId: saved.definitionId,
        initiatorId: saved.initiatorId,
        subjectType: saved.subjectType,
        subjectId: saved.subjectId,
        approvedBy: userId,
      });
    }
    return saved;
  }

  async rejectStep(
    instanceId: string,
    stepId: string,
    userId: string,
    tenantId: string,
    dto: ApproveStepDto,
  ): Promise<WorkflowInstance> {
    const { instance } = await this.loadActionableInstance(instanceId, stepId, userId, tenantId);

    instance.history = [
      ...instance.history,
      {
        stepId,
        action: 'rejected',
        userId,
        comment: dto.comment,
        timestamp: new Date().toISOString(),
      },
    ];
    instance.status = WorkflowInstanceStatus.REJECTED;
    instance.currentStep = null;

    const saved = await this.instanceRepository.save(instance);
    await this.automation?.emit(tenantId, 'workflow.rejected', {
      instanceId: saved.id,
      definitionId: saved.definitionId,
      initiatorId: saved.initiatorId,
      subjectType: saved.subjectType,
      subjectId: saved.subjectId,
      rejectedBy: userId,
      comment: dto.comment ?? null,
    });
    return saved;
  }

  async getMyPendingApprovals(userId: string, tenantId: string): Promise<WorkflowInstance[]> {
    return this.instanceRepository.find({
      where: {
        tenantId,
        status: WorkflowInstanceStatus.IN_PROGRESS,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getWorkflowHistory(tenantId: string, subjectType: string, subjectId: string): Promise<WorkflowInstance[]> {
    return this.instanceRepository.find({
      where: { tenantId, subjectType, subjectId },
      order: { createdAt: 'DESC' },
    });
  }
}
