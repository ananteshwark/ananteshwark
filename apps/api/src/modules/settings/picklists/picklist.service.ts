import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Picklist, PicklistOption } from './picklist.entity';
import { PICKLIST_DEFAULTS } from './picklist-defaults';

@Injectable()
export class PicklistService {
  constructor(
    @InjectRepository(Picklist) private readonly picklists: Repository<Picklist>,
    @InjectRepository(PicklistOption) private readonly options: Repository<PicklistOption>,
  ) {}

  /** Seed default picklists for a tenant once (idempotent — only creates missing keys). */
  private async ensureSeeded(tenantId: string): Promise<void> {
    const existing = await this.picklists.find({ where: { tenantId } });
    const have = new Set(existing.map((p) => `${p.module}:${p.key}`));
    const toCreate = PICKLIST_DEFAULTS.filter((d) => !have.has(`${d.module}:${d.key}`));
    for (const d of toCreate) {
      const pl = this.picklists.create({
        tenantId,
        module: d.module,
        key: d.key,
        label: d.label,
        description: d.description ?? null,
        isSystem: true,
        options: d.options.map((opt, i) =>
          this.options.create({ tenantId, value: opt.value, label: opt.label, color: opt.color ?? null, sortOrder: i, active: true }),
        ),
      });
      await this.picklists.save(pl);
    }
  }

  async list(tenantId: string, module?: string): Promise<Picklist[]> {
    await this.ensureSeeded(tenantId);
    const where: any = { tenantId };
    if (module) where.module = module;
    const rows = await this.picklists.find({ where, order: { module: 'ASC', label: 'ASC' } });
    rows.forEach((r) => r.options?.sort((a, b) => a.sortOrder - b.sortOrder));
    return rows;
  }

  async modules(tenantId: string): Promise<string[]> {
    await this.ensureSeeded(tenantId);
    const rows = await this.picklists
      .createQueryBuilder('p')
      .select('DISTINCT p.module', 'module')
      .where('p.tenantId = :tenantId', { tenantId })
      .orderBy('p.module', 'ASC')
      .getRawMany();
    return rows.map((r) => r.module);
  }

  /** Resolve active options by key — consumed by module dropdowns. */
  async resolve(tenantId: string, key: string): Promise<PicklistOption[]> {
    await this.ensureSeeded(tenantId);
    const pl = await this.picklists.findOne({ where: { tenantId, key } });
    if (!pl) return [];
    return (pl.options ?? []).filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async findOwned(tenantId: string, id: string): Promise<Picklist> {
    const pl = await this.picklists.findOne({ where: { id, tenantId } });
    if (!pl) throw new NotFoundException(`Picklist ${id} not found`);
    return pl;
  }

  async createPicklist(tenantId: string, dto: { module: string; key: string; label: string; description?: string }): Promise<Picklist> {
    if (!dto.module || !dto.key || !dto.label) throw new BadRequestException('module, key and label are required');
    const dup = await this.picklists.findOne({ where: { tenantId, module: dto.module, key: dto.key } });
    if (dup) throw new BadRequestException(`Picklist ${dto.module}/${dto.key} already exists`);
    const pl = this.picklists.create({ tenantId, module: dto.module, key: dto.key, label: dto.label, description: dto.description ?? null, isSystem: false, options: [] });
    return this.picklists.save(pl);
  }

  async updatePicklist(tenantId: string, id: string, dto: { label?: string; description?: string }): Promise<Picklist> {
    const pl = await this.findOwned(tenantId, id);
    if (dto.label !== undefined) pl.label = dto.label;
    if (dto.description !== undefined) pl.description = dto.description;
    return this.picklists.save(pl);
  }

  async deletePicklist(tenantId: string, id: string): Promise<void> {
    const pl = await this.findOwned(tenantId, id);
    if (pl.isSystem) throw new BadRequestException('System picklists cannot be deleted; deactivate its options instead');
    await this.picklists.remove(pl);
  }

  async addOption(tenantId: string, picklistId: string, dto: { value: string; label: string; color?: string }): Promise<PicklistOption> {
    await this.findOwned(tenantId, picklistId);
    if (!dto.value || !dto.label) throw new BadRequestException('value and label are required');
    const count = await this.options.count({ where: { tenantId, picklistId } });
    const opt = this.options.create({ tenantId, picklistId, value: dto.value, label: dto.label, color: dto.color ?? null, sortOrder: count, active: true });
    return this.options.save(opt);
  }

  async updateOption(tenantId: string, optionId: string, dto: { value?: string; label?: string; color?: string; active?: boolean; sortOrder?: number }): Promise<PicklistOption> {
    const opt = await this.options.findOne({ where: { id: optionId, tenantId } });
    if (!opt) throw new NotFoundException(`Option ${optionId} not found`);
    Object.assign(opt, dto);
    return this.options.save(opt);
  }

  async deleteOption(tenantId: string, optionId: string): Promise<void> {
    const opt = await this.options.findOne({ where: { id: optionId, tenantId } });
    if (!opt) throw new NotFoundException(`Option ${optionId} not found`);
    await this.options.remove(opt);
  }

  async reorder(tenantId: string, picklistId: string, orderedIds: string[]): Promise<PicklistOption[]> {
    await this.findOwned(tenantId, picklistId);
    for (let i = 0; i < orderedIds.length; i++) {
      await this.options.update({ id: orderedIds[i], tenantId, picklistId }, { sortOrder: i });
    }
    return this.options.find({ where: { tenantId, picklistId }, order: { sortOrder: 'ASC' } });
  }
}
