import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('inv_warehouses')
@Index(['tenantId', 'code'], { unique: true })
export class Warehouse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) address: string | null;
  @Column({ name: 'manager_id', type: 'varchar', nullable: true }) managerId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
