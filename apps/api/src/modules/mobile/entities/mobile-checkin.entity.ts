import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * Ph-263 — A mobile timesheet check-in/out with GPS coordinates.
 */
@Entity('mob_checkins')
@Index(['tenantId', 'employeeId', 'date'])
export class MobileCheckin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'task_id', type: 'varchar', nullable: true })
  taskId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'gps_lat', type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimalTransformer })
  gpsLat: number | null;

  @Column({ name: 'gps_lng', type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimalTransformer })
  gpsLng: number | null;

  @Column({ name: 'check_in_at', type: 'timestamp' })
  checkInAt: Date;

  @Column({ name: 'check_out_at', type: 'timestamp', nullable: true })
  checkOutAt: Date | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  hours: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
