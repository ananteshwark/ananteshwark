import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentSequence } from './document-sequence.entity';

@Injectable()
export class SequenceService {
  constructor(
    @InjectRepository(DocumentSequence)
    private readonly repo: Repository<DocumentSequence>,
  ) {}

  /**
   * Atomically return the next value for (tenantId, key), starting at 1.
   * Uses a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING so concurrent
   * callers can never receive the same number (unlike count()+1).
   */
  async next(tenantId: string, key: string): Promise<number> {
    const rows = await this.repo.query(
      `INSERT INTO document_sequences (tenant_id, key, next_value)
       VALUES ($1, $2, 1)
       ON CONFLICT (tenant_id, key)
       DO UPDATE SET next_value = document_sequences.next_value + 1, "updatedAt" = now()
       RETURNING next_value`,
      [tenantId, key],
    );
    return Number(rows[0].next_value);
  }

  /**
   * Format a document number: prefix + zero-padded next value, e.g.
   * `formatted(tenantId, 'sourcing-event', 'EVT-', 6)` -> "EVT-000001".
   */
  async formatted(tenantId: string, key: string, prefix: string, pad = 6): Promise<string> {
    const n = await this.next(tenantId, key);
    return `${prefix}${String(n).padStart(pad, '0')}`;
  }
}
