import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('pm_functional_locations')
@Index(['tenantId', 'code'], { unique: true })
export class FunctionalLocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) code: string;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId: string | null;
  @Column({ name: 'structure_indicator', length: 50, nullable: true }) structureIndicator: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
