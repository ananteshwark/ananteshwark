import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ZxPartyType {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  LEGAL_ENTITY = 'LEGAL_ENTITY',
}

/**
 * Ph-123 — Tax registration of a party in a regime (e.g. a vendor's GSTIN /
 * VAT number). Used to validate transactions and drive determination
 * (registered vs unregistered changes applicability).
 */
@Entity('zx_registrations')
@Index(['tenantId', 'partyType', 'partyId', 'regimeId'], { unique: true })
export class ZxRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'party_type', type: 'enum', enum: ZxPartyType })
  partyType: ZxPartyType;

  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @Column({ name: 'regime_id', type: 'uuid' })
  regimeId: string;

  @Column({ name: 'registration_number', length: 60 })
  registrationNumber: string;

  @Column({ length: 60, nullable: true })
  jurisdiction: string | null; // e.g. state code

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
