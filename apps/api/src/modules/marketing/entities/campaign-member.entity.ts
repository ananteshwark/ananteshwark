import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum MemberStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  OPENED = 'OPENED',
  CLICKED = 'CLICKED',
  BOUNCED = 'BOUNCED',
  CONVERTED = 'CONVERTED',
}

/**
 * Ph-233/236 — A lead/contact targeted by a campaign, with engagement state and
 * any attributed conversion value.
 */
@Entity('mkt_campaign_members')
@Index(['tenantId', 'campaignId'])
@Index(['tenantId', 'leadId'])
export class CampaignMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @Column({ name: 'lead_id', type: 'varchar' })
  leadId: string;

  @Column({ type: 'enum', enum: MemberStatus, default: MemberStatus.PENDING })
  status: MemberStatus;

  @Column({ name: 'converted_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  convertedValue: number;

  @Column({ name: 'opportunity_id', type: 'uuid', nullable: true })
  opportunityId: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
