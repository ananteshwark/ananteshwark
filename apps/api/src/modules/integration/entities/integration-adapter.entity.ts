import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AdapterAuthType {
  API_KEY = 'API_KEY',
  OAUTH2 = 'OAUTH2',
  BASIC = 'BASIC',
  NONE = 'NONE',
}

/**
 * Ph-277/278 — A generic integration adapter (auth, pagination, retry policy),
 * optionally instantiated from a pre-built connector template.
 */
@Entity('integration_adapters')
@Index(['tenantId', 'code'], { unique: true })
export class IntegrationAdapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 60 })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 60, nullable: true })
  connector: string | null; // SALESFORCE / STRIPE / SHOPIFY / QUICKBOOKS / JIRA / CUSTOM

  @Column({ name: 'auth_type', type: 'enum', enum: AdapterAuthType, default: AdapterAuthType.API_KEY })
  authType: AdapterAuthType;

  @Column({ name: 'base_url', length: 300, nullable: true })
  baseUrl: string | null;

  @Column({ name: 'page_size', type: 'int', default: 100 })
  pageSize: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'jsonb', default: {} })
  config: any;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
