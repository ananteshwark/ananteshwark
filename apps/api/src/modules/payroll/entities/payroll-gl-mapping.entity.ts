import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PayrollGlComponentType {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
  EMPLOYER_CONTRIBUTION = 'EMPLOYER_CONTRIBUTION',
  NET_PAY = 'NET_PAY',
}

@Entity('pay_gl_mappings')
@Index(['tenantId', 'componentType', 'componentCode'], { unique: true })
export class PayrollGlMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'component_type', type: 'enum', enum: PayrollGlComponentType })
  componentType: PayrollGlComponentType;

  // null = applies to all components of this type
  @Column({ name: 'component_code', length: 100, nullable: true })
  componentCode: string | null;

  @Column({ name: 'debit_account_id', type: 'uuid', nullable: true })
  debitAccountId: string | null;

  @Column({ name: 'credit_account_id', type: 'uuid', nullable: true })
  creditAccountId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
