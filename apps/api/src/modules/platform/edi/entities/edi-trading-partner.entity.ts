import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('platform_edi_trading_partners')
@Index(['tenantId', 'partnerId'], { unique: true })
export class EdiTradingPartner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  // ISA-level sender/receiver ID (up to 15 chars)
  @Column({ name: 'partner_id', length: 15 })
  partnerId: string;

  @Column({ length: 200 })
  name: string;

  // Qualifier for the partner ID (e.g., "01" = DUNS, "ZZ" = mutually defined)
  @Column({ name: 'id_qualifier', length: 2, default: 'ZZ' })
  idQualifier: string;

  // Our own sender ID sent in outbound EDI
  @Column({ name: 'sender_id', length: 15 })
  senderId: string;

  @Column({ name: 'sender_qualifier', length: 2, default: 'ZZ' })
  senderQualifier: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Supported transaction sets (JSON array): ["850","855","856","810"]
  @Column({ name: 'supported_sets', type: 'json', default: '[]' })
  supportedSets: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
