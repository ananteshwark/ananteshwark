import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum SsoProtocol {
  SAML  = 'SAML',
  OIDC  = 'OIDC',
  OAUTH2 = 'OAUTH2',
}

@Entity('plt_sso_providers')
@Index(['tenantId', 'name'], { unique: true })
export class SsoProvider {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: SsoProtocol }) protocol: SsoProtocol;
  @Column({ name: 'issuer_url', nullable: true }) issuerUrl: string | null;
  @Column({ name: 'metadata_url', nullable: true }) metadataUrl: string | null;
  @Column({ name: 'client_id', nullable: true }) clientId: string | null;
  @Column({ name: 'client_secret', nullable: true, select: false }) clientSecret: string | null;
  @Column({ name: 'certificate', type: 'text', nullable: true }) certificate: string | null;
  @Column({ name: 'attribute_mapping', type: 'jsonb', default: {} }) attributeMapping: Record<string, string>;
  @Column({ name: 'is_active', default: false }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
