import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum EquipmentStatus {
  ACTIVE             = 'ACTIVE',
  INACTIVE           = 'INACTIVE',
  UNDER_MAINTENANCE  = 'UNDER_MAINTENANCE',
  DECOMMISSIONED     = 'DECOMMISSIONED',
}

@Entity('pm_equipment')
@Index(['tenantId', 'equipmentCode'], { unique: true })
export class Equipment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'equipment_code', length: 100 }) equipmentCode: string;
  @Column() name: string;
  @Column({ nullable: true }) type: string | null;
  @Column({ nullable: true }) location: string | null;
  @Column({ nullable: true }) manufacturer: string | null;
  @Column({ nullable: true }) model: string | null;
  @Column({ name: 'serial_number', nullable: true }) serialNumber: string | null;
  @Column({ name: 'installation_date', type: 'date', nullable: true }) installationDate: string | null;
  @Column({ type: 'enum', enum: EquipmentStatus, default: EquipmentStatus.ACTIVE }) status: EquipmentStatus;
  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId: string | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
