import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Attachment } from './entities/attachment.entity';
import { ObjectStorageAdapter } from './object-storage.adapter';

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    // Storage seam: when absent (positional test construction), the legacy
    // direct-filesystem behavior is preserved.
    @Optional() private readonly storage?: ObjectStorageAdapter,
  ) {}

  async upload(
    tenantId: string,
    entityType: string,
    entityId: string,
    uploadedBy: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    description?: string,
  ): Promise<Attachment> {
    const safeName = file.originalname.replace(/[/\\]/g, '_');
    const fileName = `${crypto.randomUUID()}_${safeName}`;

    let storagePath: string;
    if (this.storage) {
      // storagePath holds a backend-agnostic storage key, not a filesystem path.
      storagePath = path.posix.join(tenantId, entityType, entityId, fileName);
      await this.storage.put(storagePath, file.buffer);
    } else {
      const dir = path.join('./uploads', tenantId, entityType, entityId);
      fs.mkdirSync(dir, { recursive: true });
      storagePath = path.join(dir, fileName);
      fs.writeFileSync(storagePath, file.buffer);
    }

    const attachment = this.attachmentRepo.create({
      tenantId,
      entityType,
      entityId,
      originalName: file.originalname,
      storagePath,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy,
      description: description ?? null,
    });
    return this.attachmentRepo.save(attachment);
  }

  async list(tenantId: string, entityType: string, entityId: string): Promise<Attachment[]> {
    return this.attachmentRepo.find({
      where: { tenantId, entityType, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Attachment> {
    const attachment = await this.attachmentRepo.findOne({ where: { id, tenantId } });
    if (!attachment) throw new NotFoundException(`Attachment ${id} not found`);
    return attachment;
  }

  /** The attachment row plus its content, whichever backend holds it. */
  async getContent(tenantId: string, id: string): Promise<{ attachment: Attachment; buffer: Buffer }> {
    const attachment = await this.findById(tenantId, id);
    const buffer = this.storage
      ? await this.storage.get(attachment.storagePath)
      : (fs.existsSync(attachment.storagePath) ? fs.readFileSync(attachment.storagePath) : null);
    if (!buffer) throw new NotFoundException(`Stored content for attachment ${id} is missing`);
    return { attachment, buffer };
  }

  async delete(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const attachment = await this.findById(tenantId, id);
    try {
      if (this.storage) {
        await this.storage.remove(attachment.storagePath);
      } else if (attachment.storagePath && fs.existsSync(attachment.storagePath)) {
        fs.unlinkSync(attachment.storagePath);
      }
    } catch {
      // ignore storage errors; still remove DB row
    }
    await this.attachmentRepo.delete({ id, tenantId });
    return { deleted: true };
  }
}
