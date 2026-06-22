import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum NomineeForType {
  GRATUITY = 'GRATUITY',
  PF = 'PF',
  INSURANCE = 'INSURANCE',
  OTHER = 'OTHER',
}

@Entity('hr_nominees')
@Index(['employeeId', 'tenantId'])
export class Nominee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 50 })
  relationship: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  percentage: number;

  @Column({ name: 'for_type', type: 'enum', enum: NomineeForType, default: NomineeForType.OTHER })
  forType: NomineeForType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
