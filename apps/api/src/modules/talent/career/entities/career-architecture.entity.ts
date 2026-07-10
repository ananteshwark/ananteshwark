import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A job family groups related roles (e.g. Engineering, Finance). It anchors the
 * career architecture: ladders and levels hang off a family.
 */
@Entity('tal_job_families')
@Index(['tenantId', 'code'], { unique: true })
export class JobFamily {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 40 }) code: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'function_area', length: 120, nullable: true }) functionArea: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A career ladder is the levelled progression within a family (e.g. IC1..IC6 or
 * a management track). The rungs describe each level's title, grade, and the
 * competencies expected to operate there.
 */
@Entity('tal_career_ladders')
@Index(['tenantId', 'jobFamilyId'])
export class CareerLadder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'job_family_id', type: 'uuid' }) jobFamilyId: string;
  @Column({ length: 200 }) name: string;
  @Column({ length: 20, default: 'IC' }) track: string; // IC | MANAGEMENT | TECHNICAL | DUAL
  // Ordered rungs, e.g. [{ level:1, title:'Engineer I', grade:'G7', minYears:0, competencies:[...] }].
  @Column({ type: 'jsonb', default: () => "'[]'" })
  rungs: Array<{ level: number; title: string; grade?: string; minYears?: number; competencies?: string[] }>;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum CareerPathType {
  VERTICAL = 'VERTICAL',   // promotion up the same ladder
  LATERAL = 'LATERAL',     // sideways move, often cross-family
  CROSS_FAMILY = 'CROSS_FAMILY',
}

/**
 * A career path is a named route between two roles/levels with readiness
 * criteria and a typical duration — the raw material a growth marketplace uses
 * to suggest "where can I go from here".
 */
@Entity('tal_career_paths')
@Index(['tenantId', 'fromLadderId'])
export class CareerPath {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'from_ladder_id', type: 'uuid' }) fromLadderId: string;
  @Column({ name: 'from_level', type: 'int' }) fromLevel: number;
  @Column({ name: 'to_ladder_id', type: 'uuid' }) toLadderId: string;
  @Column({ name: 'to_level', type: 'int' }) toLevel: number;
  @Column({ name: 'path_type', type: 'enum', enum: CareerPathType, default: CareerPathType.VERTICAL })
  pathType: CareerPathType;
  @Column({ name: 'typical_duration_months', type: 'int', nullable: true }) typicalDurationMonths: number | null;
  // Readiness gates, e.g. [{ criterion:'2 quarters at Exceeds', met:false }].
  @Column({ name: 'readiness_criteria', type: 'jsonb', default: () => "'[]'" })
  readinessCriteria: Array<{ criterion: string; detail?: string }>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
