import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-281/282 — A translation string for a locale, grouped by namespace.
 */
@Entity('loc_i18n_translations')
@Index(['tenantId', 'locale', 'namespace', 'key'], { unique: true })
export class I18nTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 10 })
  locale: string;

  @Column({ length: 60, default: 'ui' })
  namespace: string;

  @Column({ length: 120 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
