import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum InspectionType {
  GRN        = 'GRN',
  PRODUCTION = 'PRODUCTION',
  PERIODIC   = 'PERIODIC',
}

@Entity('qm_inspection_plans')
@Index(['tenantId', 'code'], { unique: true })
export class InspectionPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ name: 'item_code', length: 100 }) itemCode: string;
  @Column({ name: 'item_name' }) itemName: string;
  @Column({ name: 'inspection_type', type: 'enum', enum: InspectionType }) inspectionType: InspectionType;
  @Column({ type: 'jsonb', default: [] }) checkpoints: Array<{ name: string; type: 'PASS_FAIL' | 'NUMERIC' | 'TEXT'; spec?: string }>;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
