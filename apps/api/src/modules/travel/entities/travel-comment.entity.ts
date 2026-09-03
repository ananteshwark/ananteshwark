import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Threaded message on a travel request — the admin/agent ↔ employee chat
 * about bookings, itinerary changes, etc.
 */
@Entity('trv_comments')
@Index(['tenantId', 'requestId'])
export class TravelComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'request_id', type: 'uuid' }) requestId: string;
  @Column({ name: 'author_user_id' }) authorUserId: string;
  @Column({ name: 'author_name', length: 200 }) authorName: string;
  // 'ADMIN' | 'AGENT' | 'EMPLOYEE' — labels the sender's role in the thread.
  @Column({ name: 'author_role', length: 20, default: 'EMPLOYEE' }) authorRole: string;
  @Column({ type: 'text' }) body: string;
  @CreateDateColumn() createdAt: Date;
}
