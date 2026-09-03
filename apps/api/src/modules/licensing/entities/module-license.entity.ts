import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('lic_module_licenses')
@Index(['tenantId', 'contractId', 'moduleKey'], { unique: true, where: '"is_active" = true' })
export class ModuleLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id' })
  contractId: string;

  @Column({ name: 'module_key', length: 100 })
  moduleKey: string;

  @Column({ name: 'module_name', length: 200 })
  moduleName: string;

  @Column({ name: 'max_employees', type: 'int', nullable: true })
  maxEmployees: number | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
