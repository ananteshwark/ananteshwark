import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum HolidayType {
  NATIONAL = 'NATIONAL',
  REGIONAL = 'REGIONAL',
  OPTIONAL = 'OPTIONAL',
}

@Entity('hr_holidays')
export class Holiday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: HolidayType, default: HolidayType.NATIONAL })
  type: HolidayType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
