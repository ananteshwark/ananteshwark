import { Controller, Get, Post, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDefinitionDto, StartWorkflowDto, ApproveStepDto } from './dto/workflow.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('definitions')
  @ApiOperation({ summary: 'List workflow definitions' })
  getDefinitions(@CurrentUser() user: any) {
    return this.workflowService.getDefinitions(user.tenantId);
  }

  @Post('definitions')
  @ApiOperation({ summary: 'Create workflow definition' })
  createDefinition(@CurrentUser() user: any, @Body() dto: CreateWorkflowDefinitionDto) {
    return this.workflowService.createDefinition(user.tenantId, user.id, dto);
  }

  @Get('definitions/:id')
  @ApiOperation({ summary: 'Get workflow definition by ID' })
  getDefinition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.workflowService.getDefinitionById(id, user.tenantId);
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a workflow instance' })
  startWorkflow(@CurrentUser() user: any, @Body() dto: StartWorkflowDto) {
    return this.workflowService.startWorkflow(user.tenantId, user.id, dto);
  }

  @Get('instances/pending')
  @ApiOperation({ summary: 'Get my pending approvals' })
  getMyPendingApprovals(@CurrentUser() user: any) {
    return this.workflowService.getMyPendingApprovals(user.id, user.tenantId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get workflow history for a subject' })
  getHistory(
    @CurrentUser() user: any,
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.workflowService.getWorkflowHistory(user.tenantId, subjectType, subjectId);
  }

  @Post('instances/:id/steps/:stepId/approve')
  @ApiOperation({ summary: 'Approve a workflow step' })
  approveStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveStepDto,
  ) {
    return this.workflowService.approveStep(id, stepId, user.id, user.tenantId, dto);
  }

  @Post('instances/:id/steps/:stepId/reject')
  @ApiOperation({ summary: 'Reject a workflow step' })
  rejectStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveStepDto,
  ) {
    return this.workflowService.rejectStep(id, stepId, user.id, user.tenantId, dto);
  }
}
