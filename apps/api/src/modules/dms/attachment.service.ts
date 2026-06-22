import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Attachment } from './entities/attachment.entity';

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
  ) {}

  async upload(
    tenantId: string,
    entityType: string,
    entityId: string,
    uploadedBy: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    description?: string,
  ): Promise<Attachment> {
    const dir = path.join('./uploads', tenantId, entityType, entityId);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = file.originalname.replace(/[/\\]/g, '_');
    const fileName = `${crypto.randomUUID()}_${safeName}`;
    const storagePath = path.join(dir, fileName);
    fs.writeFileSync(storagePath, file.buffer);

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

  async delete(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const attachment = await this.findById(tenantId, id);
    try {
      if (attachment.storagePath && fs.existsSync(attachment.storagePath)) {
        fs.unlinkSync(attachment.storagePath);
      }
    } catch {
      // ignore filesystem errors; still remove DB row
    }
    await this.attachmentRepo.delete({ id, tenantId });
    return { deleted: true };
  }
}
