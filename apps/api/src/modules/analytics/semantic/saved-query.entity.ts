import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** A reusable semantic-layer query definition (dashboard tile source). */
@Entity('anx_saved_queries')
@Index(['tenantId'])
export class SavedQuery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Rendering hint for the client: table | bar | line | pie | stat
  @Column({ name: 'chart_type', length: 20, default: 'table' }) chartType: string;
  @Column({ type: 'jsonb' }) definition: Record<string, any>;
  @Column({ name: 'created_by', nullable: true }) createdBy: string | null;
  @CreateDateColumn() createdAt: Date;
}
