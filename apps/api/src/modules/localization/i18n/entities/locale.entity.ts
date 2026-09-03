import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-281/283 — A supported UI locale with direction and formatting defaults.
 */
@Entity('loc_i18n_locales')
@Index(['tenantId', 'code'], { unique: true })
export class I18nLocale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 10 })
  code: string;

  @Column({ length: 80 })
  name: string;

  @Column({ default: false })
  rtl: boolean;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
