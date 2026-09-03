import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ScenarioType {
  RESTRUCTURE = 'RESTRUCTURE',
  REDUCTION = 'REDUCTION',
  EXPANSION = 'EXPANSION',
  MERGER = 'MERGER',
}

export enum ScenarioStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED', // modeled & locked; never auto-applied to live data
  DISCARDED = 'DISCARDED',
}

/**
 * Ph-193 — A what-if workforce planning scenario. Holds a set of position FTE
 * changes that are modeled against live baselines WITHOUT mutating live data.
 */
@Entity('hr_workforce_scenarios')
@Index(['tenantId', 'status'])
export class WorkforceScenario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'scenario_type', type: 'enum', enum: ScenarioType, default: ScenarioType.RESTRUCTURE })
  scenarioType: ScenarioType;

  @Column({ type: 'enum', enum: ScenarioStatus, default: ScenarioStatus.DRAFT })
  status: ScenarioStatus;

  /** [{ positionId, action: 'ADD'|'REMOVE'|'ADJUST', deltaFte, note }] */
  @Column({ type: 'jsonb', default: [] })
  changes: Array<{ positionId: string; action: string; deltaFte: number; note?: string }>;

  @Column({ name: 'fiscal_year', type: 'int', nullable: true })
  fiscalYear: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
