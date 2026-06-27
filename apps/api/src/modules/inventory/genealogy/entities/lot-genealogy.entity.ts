import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum GenealogyRelation {
  CONSUMED = 'CONSUMED', // child lot consumed to make parent lot (production)
  RECEIVED = 'RECEIVED', // supplier lot → received lot
  TRANSFORMED = 'TRANSFORMED', // repack / split / merge
}

/**
 * Ph-141 — Lot genealogy edge.
 * A directed parent→child relationship: the parent lot (e.g. a finished good)
 * was produced from / contains the child lot (e.g. a raw material). Backward
 * trace walks parent→children; forward trace walks child→parents.
 */
@Entity('inv_lot_genealogy')
@Index(['tenantId', 'parentLotId'])
@Index(['tenantId', 'childLotId'])
export class LotGenealogy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'parent_lot_id', type: 'uuid' })
  parentLotId: string;

  @Column({ name: 'child_lot_id', type: 'uuid' })
  childLotId: string;

  @Column({ type: 'enum', enum: GenealogyRelation, default: GenealogyRelation.CONSUMED })
  relation: GenealogyRelation;

  @Column({ name: 'quantity_used', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantityUsed: number;

  @Column({ name: 'source_type', length: 30, nullable: true })
  sourceType: string | null; // PRODUCTION_ORDER / GRN

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: string;

  @CreateDateColumn() createdAt: Date;
}
