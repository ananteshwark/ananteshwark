import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrirEntry, GrirType, GrirStatus } from './entities/grir-entry.entity';

@Injectable()
export class GrirService {
  constructor(
    @InjectRepository(GrirEntry)
    private readonly grirRepo: Repository<GrirEntry>,
  ) {}

  async createGrEntry(tenantId: string, data: Partial<GrirEntry>): Promise<GrirEntry> {
    const entry = this.grirRepo.create({
      ...data,
      tenantId,
      type: GrirType.GR,
      status: GrirStatus.OPEN,
    });
    return this.grirRepo.save(entry);
  }

  async createIvEntry(tenantId: string, data: Partial<GrirEntry>): Promise<GrirEntry> {
    const entry = this.grirRepo.create({
      ...data,
      tenantId,
      type: GrirType.IV,
      status: GrirStatus.OPEN,
    });
    return this.grirRepo.save(entry);
  }

  async autoMatch(tenantId: string): Promise<{ matched: number }> {
    const openGrEntries = await this.grirRepo.find({
      where: { tenantId, type: GrirType.GR, status: GrirStatus.OPEN },
    });

    const openIvEntries = await this.grirRepo.find({
      where: { tenantId, type: GrirType.IV, status: GrirStatus.OPEN },
    });

    let matched = 0;
    const now = new Date();

    for (const gr of openGrEntries) {
      if (!gr.poId) continue;

      // Find a matching IV entry with same poId and matching total amount (within tolerance)
      const matchingIv = openIvEntries.find(
        (iv) =>
          iv.poId === gr.poId &&
          iv.status === GrirStatus.OPEN &&
          Math.abs(Number(iv.totalAmount) - Number(gr.totalAmount)) < 0.01,
      );

      if (matchingIv) {
        // Mark both as CLEARED
        gr.status = GrirStatus.CLEARED;
        gr.clearedWith = matchingIv.id;
        gr.clearedAt = now;

        matchingIv.status = GrirStatus.CLEARED;
        matchingIv.clearedWith = gr.id;
        matchingIv.clearedAt = now;

        await this.grirRepo.save(gr);
        await this.grirRepo.save(matchingIv);

        matched++;
      }
    }

    return { matched };
  }

  async getOpenItems(tenantId: string): Promise<{ grItems: GrirEntry[]; ivItems: GrirEntry[] }> {
    const openEntries = await this.grirRepo.find({
      where: { tenantId, status: GrirStatus.OPEN },
      order: { createdAt: 'ASC' },
    });

    const grItems = openEntries.filter((e) => e.type === GrirType.GR);
    const ivItems = openEntries.filter((e) => e.type === GrirType.IV);

    return { grItems, ivItems };
  }

  async getReport(tenantId: string): Promise<{ grItems: any[]; ivItems: any[] }> {
    const { grItems, ivItems } = await this.getOpenItems(tenantId);
    const now = new Date();

    const addAge = (items: GrirEntry[]) =>
      items.map((item) => ({
        ...item,
        ageDays: Math.floor((now.getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      }));

    return {
      grItems: addAge(grItems),
      ivItems: addAge(ivItems),
    };
  }
}
