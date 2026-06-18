import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowInstance, WorkflowInstanceStatus } from './entities/workflow-instance.entity';
import { CreateWorkflowDefinitionDto, StartWorkflowDto, ApproveStepDto } from './dto/workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkflowDefinition)
    private readonly definitionRepository: Repository<WorkflowDefinition>,
    @InjectRepository(WorkflowInstance)
    private readonly instanceRepository: Repository<WorkflowInstance>,
  ) {}

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
    return this.instanceRepository.save(instance);
  }

  async approveStep(
    instanceId: string,
    stepId: string,
    userId: string,
    dto: ApproveStepDto,
  ): Promise<WorkflowInstance> {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Workflow instance not found');
    if (instance.currentStep !== stepId) {
      throw new BadRequestException(`Step ${stepId} is not the current active step`);
    }

    const definition = await this.definitionRepository.findOne({
      where: { id: instance.definitionId },
    });
    const currentStepDef = definition?.steps?.find(s => s.id === stepId);

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

    return this.instanceRepository.save(instance);
  }

  async rejectStep(
    instanceId: string,
    stepId: string,
    userId: string,
    dto: ApproveStepDto,
  ): Promise<WorkflowInstance> {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException('Workflow instance not found');

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

    return this.instanceRepository.save(instance);
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

  async getWorkflowHistory(subjectType: string, subjectId: string): Promise<WorkflowInstance[]> {
    return this.instanceRepository.find({
      where: { subjectType, subjectId },
      order: { createdAt: 'DESC' },
    });
  }
}
