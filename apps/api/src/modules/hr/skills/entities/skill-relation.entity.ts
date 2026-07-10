import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SkillRelationType {
  RELATED = 'RELATED',           // adjacent skills
  PREREQUISITE = 'PREREQUISITE', // from is a prerequisite of to
  BROADER = 'BROADER',           // from is a broader concept than to
  NARROWER = 'NARROWER',         // from is a narrower concept than to
  ALIAS = 'ALIAS',               // from is an alias / synonym of to
}

/**
 * A directed edge in the skill ontology graph. Enables "related skills",
 * prerequisite chains, and synonym resolution across the catalog.
 */
@Entity('hr_skill_relations')
@Index(['tenantId', 'fromSkillId'])
@Index(['tenantId', 'fromSkillId', 'toSkillId', 'relationType'], { unique: true })
export class SkillRelation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'from_skill_id', type: 'uuid' }) fromSkillId: string;
  @Column({ name: 'to_skill_id', type: 'uuid' }) toSkillId: string;
  @Column({ name: 'relation_type', type: 'enum', enum: SkillRelationType, default: SkillRelationType.RELATED })
  relationType: SkillRelationType;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
}
