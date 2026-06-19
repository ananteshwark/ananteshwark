import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('hr_locations')
@Index(['code', 'tenantId'], { unique: true })
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ length: 100, nullable: true })
  state: string | null;

  @Column({ length: 100, nullable: true })
  country: string | null;

  @Column({ length: 100, default: 'Asia/Kolkata' })
  timezone: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
