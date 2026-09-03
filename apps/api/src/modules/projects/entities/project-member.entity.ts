import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum MemberRole {
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  OBSERVER = 'OBSERVER',
}

@Entity('prj_members')
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @Column({ name: 'employee_id', type: 'varchar' }) employeeId: string;
  @Column({ type: 'enum', enum: MemberRole, default: MemberRole.MEMBER }) role: MemberRole;
  @Column({ name: 'joined_at', type: 'date' }) joinedAt: string;
  @Column({ name: 'left_at', type: 'date', nullable: true }) leftAt: string | null;
  @CreateDateColumn() createdAt: Date;
}
