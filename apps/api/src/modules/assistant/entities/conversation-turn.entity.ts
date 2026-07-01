import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * Ph-265 — A logged assistant conversation turn (utterance → classified intent).
 */
@Entity('asst_conversation_turns')
@Index(['tenantId', 'userId'])
export class ConversationTurn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ type: 'text' })
  utterance: string;

  @Column({ length: 40 })
  intent: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  confidence: number;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @CreateDateColumn() createdAt: Date;
}
