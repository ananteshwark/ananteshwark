import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Weekly shift pattern: a repeating Mon–Sun schedule of shift ids (or nulls
 * for rest/off days). Rotating patterns advance one slot per week so crews
 * cycle through the schedule. Generating assignments from a pattern is how
 * rosters get built without hand-assigning every day.
 */
@Entity('hr_shift_patterns')
@Index(['tenantId'])
export class ShiftPattern {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  // 7 slots, Monday-first. null = rest day, 'OFF' = weekly off, else a shiftId.
  @Column({ name: 'week_slots', type: 'jsonb' }) weekSlots: (string | null)[];
  // Rotating patterns shift the start slot by one each ISO week.
  @Column({ default: false }) rotating: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
