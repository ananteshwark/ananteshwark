import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('eng_badges')
@Index(['tenantId', 'name'], { unique: true })
export class RecognitionBadge {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Emoji or short icon token rendered next to the badge name.
  @Column({ length: 16, default: '🏅' }) icon: string;
  @Column({ type: 'int', default: 0 }) points: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}

export enum RecognitionVisibility {
  PUBLIC  = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

@Entity('eng_recognitions')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'toEmployeeId'])
export class Recognition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'badge_id' }) badgeId: string;
  // Snapshots survive later badge edits/deactivation.
  @Column({ name: 'badge_name' }) badgeName: string;
  @Column({ name: 'badge_icon', length: 16, default: '🏅' }) badgeIcon: string;
  @Column({ name: 'from_user_id' }) fromUserId: string;
  @Column({ name: 'from_name' }) fromName: string;
  @Column({ name: 'to_employee_id' }) toEmployeeId: string;
  @Column({ name: 'to_name' }) toName: string;
  @Column({ type: 'text' }) message: string;
  @Column({ type: 'int', default: 0 }) points: number;
  @Column({ type: 'enum', enum: RecognitionVisibility, default: RecognitionVisibility.PUBLIC })
  visibility: RecognitionVisibility;
  @CreateDateColumn() createdAt: Date;
}
