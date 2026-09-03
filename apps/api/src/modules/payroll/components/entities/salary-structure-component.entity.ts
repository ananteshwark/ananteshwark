import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('pay_structure_components')
@Index(['structureId', 'tenantId'])
export class SalaryStructureComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  value: number | null;

  @Column({
    type: 'numeric',
    precision: 9,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  percentage: number | null;

  @Column({ type: 'int', default: 0 })
  sequence: number;

  @CreateDateColumn()
  createdAt: Date;
}
