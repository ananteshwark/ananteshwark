import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ClauseRisk {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * Ph-209 — A reusable, approved contract clause in the clause library.
 * Contracts are assembled from approved clauses.
 */
@Entity('clm_clauses')
@Index(['tenantId', 'code'], { unique: true })
export class ContractClause {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  title: string;

  @Column({ length: 80, nullable: true })
  category: string | null;

  @Column({ name: 'standard_text', type: 'text' })
  standardText: string;

  @Column({ name: 'risk_level', type: 'enum', enum: ClauseRisk, default: ClauseRisk.LOW })
  riskLevel: ClauseRisk;

  @Column({ name: 'is_approved', default: false })
  isApproved: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
