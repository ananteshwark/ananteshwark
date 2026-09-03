import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum SignatureProvider {
  DOCUSIGN = 'DOCUSIGN',
  ADOBE_SIGN = 'ADOBE_SIGN',
  INTERNAL = 'INTERNAL',
}

export enum EnvelopeStatus {
  CREATED = 'CREATED',
  SENT = 'SENT',
  SIGNED = 'SIGNED',
  DECLINED = 'DECLINED',
  VOIDED = 'VOIDED',
}

/**
 * Ph-212 — An e-signature envelope for a contract. Models the provider
 * lifecycle (DocuSign / Adobe Sign) behind a provider-agnostic abstraction.
 */
@Entity('clm_signature_envelopes')
@Index(['tenantId', 'contractId'])
export class SignatureEnvelope {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ type: 'enum', enum: SignatureProvider, default: SignatureProvider.INTERNAL })
  provider: SignatureProvider;

  @Column({ type: 'enum', enum: EnvelopeStatus, default: EnvelopeStatus.CREATED })
  status: EnvelopeStatus;

  @Column({ name: 'external_id', length: 120, nullable: true })
  externalId: string | null;

  /** [{ name, email, order, status, signedAt }] */
  @Column({ type: 'jsonb', default: [] })
  signers: Array<{ name: string; email: string; order?: number; status?: string; signedAt?: string }>;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
