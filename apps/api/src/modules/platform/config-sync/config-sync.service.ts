import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigSnapshot } from './entities/config-snapshot.entity';

export interface ConfigDiff {
  added: Array<{ key: string; value: any }>;
  removed: Array<{ key: string; value: any }>;
  changed: Array<{ key: string; from: any; to: any }>;
  unchanged: number;
}

@Injectable()
export class ConfigSyncService {
  constructor(
    @InjectRepository(ConfigSnapshot) private readonly snapRepo: Repository<ConfigSnapshot>,
  ) {}

  static checksum(payload: Record<string, any>): string {
    // Stable stringify (sorted keys) so equal maps hash equal.
    const stable = JSON.stringify(payload ?? {}, Object.keys(payload ?? {}).sort());
    return crypto.createHash('sha256').update(stable).digest('hex');
  }

  async capture(tenantId: string, dto: { name: string; environment?: string; payload: Record<string, any>; createdByUserId?: string }): Promise<ConfigSnapshot> {
    if (!dto.name?.trim() || !dto.payload || typeof dto.payload !== 'object') throw new BadRequestException('name and a payload object are required');
    return this.snapRepo.save(this.snapRepo.create({
      tenantId, name: dto.name.trim(), environment: dto.environment ?? 'SANDBOX',
      payload: dto.payload, checksum: ConfigSyncService.checksum(dto.payload), createdByUserId: dto.createdByUserId ?? null,
    }));
  }

  listSnapshots(tenantId: string, environment?: string): Promise<ConfigSnapshot[]> {
    const where: any = { tenantId };
    if (environment) where.environment = environment;
    return this.snapRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getSnapshot(tenantId: string, id: string): Promise<ConfigSnapshot> {
    const snap = await this.snapRepo.findOne({ where: { id, tenantId } });
    if (!snap) throw new NotFoundException(`Snapshot ${id} not found`);
    return snap;
  }

  /** Key-level diff between two config maps (base → target). */
  static diff(base: Record<string, any>, target: Record<string, any>): ConfigDiff {
    const b = base ?? {}, t = target ?? {};
    const keys = new Set([...Object.keys(b), ...Object.keys(t)]);
    const out: ConfigDiff = { added: [], removed: [], changed: [], unchanged: 0 };
    for (const key of keys) {
      const inB = key in b, inT = key in t;
      if (inT && !inB) out.added.push({ key, value: t[key] });
      else if (inB && !inT) out.removed.push({ key, value: b[key] });
      else if (JSON.stringify(b[key]) !== JSON.stringify(t[key])) out.changed.push({ key, from: b[key], to: t[key] });
      else out.unchanged++;
    }
    return out;
  }

  async diffSnapshots(tenantId: string, baseId: string, targetId: string): Promise<ConfigDiff> {
    const [base, target] = await Promise.all([this.getSnapshot(tenantId, baseId), this.getSnapshot(tenantId, targetId)]);
    return ConfigSyncService.diff(base.payload, target.payload);
  }

  /**
   * Promote selected keys from a snapshot onto a base config map. Returns the
   * merged map and the keys applied. When `keys` is omitted, every key in the
   * snapshot is promoted.
   */
  static promote(base: Record<string, any>, snapshotPayload: Record<string, any>, keys?: string[]): { merged: Record<string, any>; applied: string[] } {
    const merged = { ...(base ?? {}) };
    const applyKeys = keys?.length ? keys : Object.keys(snapshotPayload ?? {});
    const applied: string[] = [];
    for (const k of applyKeys) {
      if (k in (snapshotPayload ?? {})) { merged[k] = snapshotPayload[k]; applied.push(k); }
    }
    return { merged, applied };
  }

  async promoteSnapshot(tenantId: string, snapshotId: string, base: Record<string, any>, keys?: string[]): Promise<{ merged: Record<string, any>; applied: string[]; checksum: string }> {
    const snap = await this.getSnapshot(tenantId, snapshotId);
    const { merged, applied } = ConfigSyncService.promote(base ?? {}, snap.payload, keys);
    return { merged, applied, checksum: ConfigSyncService.checksum(merged) };
  }
}
