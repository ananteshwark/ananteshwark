import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_workflow_configs')
@Index(['tenantId'], { unique: true })
export class WorkflowConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'require_pr_approval', type: 'boolean', default: true })
  requirePrApproval: boolean;

  @Column({
    name: 'pr_approval_threshold',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  prApprovalThreshold: number;

  @Column({ name: 'require_rfq_step', type: 'boolean', default: false })
  requireRfqStep: boolean;

  @Column({
    name: 'rfq_threshold',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  rfqThreshold: number;

  @Column({ name: 'require_po_approval', type: 'boolean', default: true })
  requirePoApproval: boolean;

  @Column({
    name: 'po_approval_threshold',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  poApprovalThreshold: number;

  @Column({ name: 'require_po_release', type: 'boolean', default: true })
  requirePoRelease: boolean;

  @Column({ name: 'require_three_way_match', type: 'boolean', default: true })
  requireThreeWayMatch: boolean;

  @Column({ name: 'allow_partial_grn', type: 'boolean', default: true })
  allowPartialGrn: boolean;

  @Column({ name: 'auto_close_po_on_full_receipt', type: 'boolean', default: false })
  autoClosePoOnFullReceipt: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
