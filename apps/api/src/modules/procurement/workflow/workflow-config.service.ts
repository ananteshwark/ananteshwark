import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowConfig } from './entities/workflow-config.entity';
import { UpdateWorkflowConfigDto } from './dto/workflow-config.dto';

@Injectable()
export class WorkflowConfigService {
  constructor(
    @InjectRepository(WorkflowConfig)
    private readonly repo: Repository<WorkflowConfig>,
  ) {}

  async getConfig(tenantId: string): Promise<WorkflowConfig> {
    let config = await this.repo.findOne({ where: { tenantId } });
    if (!config) {
      config = this.repo.create({
        tenantId,
        requirePrApproval: true,
        prApprovalThreshold: 0,
        requireRfqStep: false,
        rfqThreshold: 0,
        requirePoApproval: true,
        poApprovalThreshold: 0,
        requirePoRelease: true,
        requireThreeWayMatch: true,
        allowPartialGrn: true,
        autoClosePoOnFullReceipt: false,
      });
      config = await this.repo.save(config);
    }
    return config;
  }

  async updateConfig(tenantId: string, dto: UpdateWorkflowConfigDto): Promise<WorkflowConfig> {
    const config = await this.getConfig(tenantId);
    Object.assign(config, dto);
    return this.repo.save(config);
  }

  async shouldRequirePrApproval(tenantId: string, amount: number): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    if (!config.requirePrApproval) return false;
    return amount > config.prApprovalThreshold;
  }

  async shouldRequireRfq(tenantId: string, amount: number): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    if (!config.requireRfqStep) return false;
    return amount > config.rfqThreshold;
  }

  async shouldRequirePoApproval(tenantId: string, amount: number): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    if (!config.requirePoApproval) return false;
    return amount > config.poApprovalThreshold;
  }

  async shouldRequirePoRelease(tenantId: string): Promise<boolean> {
    const config = await this.getConfig(tenantId);
    return config.requirePoRelease;
  }
}
