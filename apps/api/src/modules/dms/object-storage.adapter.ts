import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Object-storage seam for DMS attachments. Files are addressed by a
 * storage key (`tenantId/entityType/entityId/uuid_name`) rather than a
 * filesystem path, so the backend can be swapped without touching callers.
 *
 * The default backend is local disk under DMS_STORAGE_DIR (./uploads).
 * An S3/MinIO/GCS deployment provides its own adapter implementation via
 * DI override of this provider; setting DMS_S3_BUCKET without one logs a
 * warning and keeps using local disk. Legacy rows that stored a raw
 * filesystem path (pre-seam) still resolve for reads and deletes.
 */
@Injectable()
export class ObjectStorageAdapter {
  private readonly logger = new Logger(ObjectStorageAdapter.name);
  private warnedS3 = false;

  readonly root = process.env.DMS_STORAGE_DIR ?? './uploads';

  get backend(): 'local' {
    if (process.env.DMS_S3_BUCKET && !this.warnedS3) {
      this.warnedS3 = true;
      this.logger.warn('DMS_S3_BUCKET is set but no S3 client is wired in this deployment; using local disk');
    }
    return 'local';
  }

  /** Resolve a key inside the storage root, refusing path traversal. */
  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  /** Where a stored object lives on disk: keyed path, or the legacy raw path. */
  private locate(key: string): string | null {
    try {
      const keyed = this.resolveKey(key);
      if (fs.existsSync(keyed)) return keyed;
    } catch {
      // fall through to legacy resolution
    }
    // Legacy rows stored a filesystem path (relative or absolute) directly.
    if (fs.existsSync(key)) return key;
    return null;
  }

  async put(key: string, buffer: Buffer): Promise<{ backend: string; key: string }> {
    void this.backend; // surfaces the S3-configured-but-unwired warning once
    const target = this.resolveKey(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return { backend: 'local', key };
  }

  async get(key: string): Promise<Buffer | null> {
    const found = this.locate(key);
    return found ? fs.readFileSync(found) : null;
  }

  async remove(key: string): Promise<boolean> {
    const found = this.locate(key);
    if (!found) return false;
    try {
      fs.unlinkSync(found);
      return true;
    } catch {
      return false;
    }
  }
}
