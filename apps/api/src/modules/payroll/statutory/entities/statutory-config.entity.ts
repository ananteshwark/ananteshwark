import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { StatutoryType } from '../../components/entities/pay-component.entity';

@Entity('pay_statutory_configs')
@Index(['type', 'tenantId'], { unique: true })
export class StatutoryConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: StatutoryType })
  type: StatutoryType;

  @Column({ length: 5, default: 'IN' })
  country: string;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: Record<string, any>;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
