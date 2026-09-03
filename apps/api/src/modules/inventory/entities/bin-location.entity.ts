import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('inv_bin_locations')
@Index(['tenantId', 'warehouseId', 'code'], { unique: true })
export class BinLocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ length: 50 }) code: string;
  @Column({ nullable: true }) zone: string | null;
  @Column({ nullable: true }) aisle: string | null;
  @Column({ nullable: true }) rack: string | null;
  @Column({ nullable: true }) bin: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
