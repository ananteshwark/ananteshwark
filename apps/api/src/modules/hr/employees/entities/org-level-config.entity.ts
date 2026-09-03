import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum OrgLevel {
  LEGAL_ENTITY = 'legalEntity',
  BUSINESS_UNIT = 'businessUnit',
  DIVISION = 'division',
  DEPARTMENT = 'department',
  FUNCTION = 'function',
  SUB_FUNCTION = 'subFunction',
  TEAM = 'team',
}

@Entity('hr_org_level_config')
@Index(['tenantId', 'level'], { unique: true })
export class OrgLevelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  level: OrgLevel;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: false })
  required: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
