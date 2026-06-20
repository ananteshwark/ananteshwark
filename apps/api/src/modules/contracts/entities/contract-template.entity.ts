import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ContractType } from './contract.entity';

@Entity('clm_contract_templates')
export class ContractTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: ContractType }) type: ContractType;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ name: 'default_terms', type: 'text', nullable: true }) defaultTerms: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
