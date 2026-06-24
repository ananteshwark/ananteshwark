import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CustomFieldDefinition,
  CustomFieldEntityType,
  CustomFieldType,
} from './entities/custom-field-definition.entity';
import { CustomFieldValue } from './entities/custom-field-value.entity';
import {
  CreateCustomFieldDefinitionDto,
  UpdateCustomFieldDefinitionDto,
  BulkSetCustomFieldValuesDto,
} from './dto/custom-fields.dto';

const SLUG_RE = /^[a-z][a-z0-9_]*$/;

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private readonly defRepo: Repository<CustomFieldDefinition>,
    @InjectRepository(CustomFieldValue)
    private readonly valRepo: Repository<CustomFieldValue>,
  ) {}

  // ─── Definitions ─────────────────────────────────────────────────────────────

  listDefinitions(
    tenantId: string,
    entityType?: CustomFieldEntityType,
  ): Promise<CustomFieldDefinition[]> {
    const where: any = { tenantId };
    if (entityType) where.entityType = entityType;
    return this.defRepo.find({ where, order: { entityType: 'ASC', sortOrder: 'ASC' } });
  }

  async getDefinition(tenantId: string, id: string): Promise<CustomFieldDefinition> {
    const def = await this.defRepo.findOne({ where: { id, tenantId } });
    if (!def) throw new NotFoundException(`Custom field definition ${id} not found`);
    return def;
  }

  async createDefinition(
    tenantId: string,
    dto: CreateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    const key = dto.fieldKey.toLowerCase().replace(/\s+/g, '_');
    if (!SLUG_RE.test(key)) {
      throw new BadRequestException(
        'fieldKey must start with a letter and contain only lowercase letters, digits, and underscores',
      );
    }

    const existing = await this.defRepo.findOne({
      where: { tenantId, entityType: dto.entityType, fieldKey: key },
    });
    if (existing) {
      throw new ConflictException(
        `Field "${key}" already exists on ${dto.entityType}`,
      );
    }

    if (
      (dto.fieldType === CustomFieldType.DROPDOWN ||
        dto.fieldType === CustomFieldType.MULTI_SELECT) &&
      (!dto.options || dto.options.length === 0)
    ) {
      throw new BadRequestException(
        'DROPDOWN and MULTI_SELECT fields must have at least one option',
      );
    }

    const def = this.defRepo.create({
      tenantId,
      entityType: dto.entityType,
      fieldKey: key,
      fieldLabel: dto.fieldLabel,
      fieldType: dto.fieldType,
      isRequired: dto.isRequired ?? false,
      showInList: dto.showInList ?? false,
      options: dto.options ?? null,
      defaultValue: dto.defaultValue ?? null,
      sortOrder: dto.sortOrder ?? 0,
      description: dto.description ?? null,
      isActive: true,
    });
    return this.defRepo.save(def);
  }

  async updateDefinition(
    tenantId: string,
    id: string,
    dto: UpdateCustomFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    const def = await this.getDefinition(tenantId, id);
    if (dto.fieldLabel !== undefined) def.fieldLabel = dto.fieldLabel;
    if (dto.isRequired !== undefined) def.isRequired = dto.isRequired;
    if (dto.isActive !== undefined) def.isActive = dto.isActive;
    if (dto.showInList !== undefined) def.showInList = dto.showInList;
    if (dto.options !== undefined) def.options = dto.options;
    if (dto.defaultValue !== undefined) def.defaultValue = dto.defaultValue;
    if (dto.sortOrder !== undefined) def.sortOrder = dto.sortOrder;
    if (dto.description !== undefined) def.description = dto.description;
    return this.defRepo.save(def);
  }

  async deleteDefinition(tenantId: string, id: string): Promise<void> {
    const def = await this.getDefinition(tenantId, id);
    await this.valRepo.delete({ fieldDefinitionId: def.id });
    await this.defRepo.remove(def);
  }

  // ─── Values ───────────────────────────────────────────────────────────────────

  async getEntityValues(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<Record<string, any>> {
    const [defs, vals] = await Promise.all([
      this.defRepo.find({
        where: { tenantId, entityType: entityType as CustomFieldEntityType, isActive: true },
        order: { sortOrder: 'ASC' },
      }),
      this.valRepo.find({ where: { tenantId, entityType, entityId } }),
    ]);

    const valMap = new Map(vals.map((v) => [v.fieldDefinitionId, v.value]));
    const result: Record<string, any> = {};

    for (const def of defs) {
      const raw = valMap.get(def.id) ?? def.defaultValue ?? null;
      result[def.fieldKey] = this.castValue(raw, def.fieldType);
    }

    return result;
  }

  async getEntityValuesWithMeta(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<Array<{ definition: CustomFieldDefinition; value: any }>> {
    const [defs, vals] = await Promise.all([
      this.defRepo.find({
        where: { tenantId, entityType: entityType as CustomFieldEntityType, isActive: true },
        order: { sortOrder: 'ASC' },
      }),
      this.valRepo.find({ where: { tenantId, entityType, entityId } }),
    ]);

    const valMap = new Map(vals.map((v) => [v.fieldDefinitionId, v.value]));
    return defs.map((def) => ({
      definition: def,
      value: this.castValue(valMap.get(def.id) ?? def.defaultValue ?? null, def.fieldType),
    }));
  }

  async bulkSetValues(
    tenantId: string,
    entityType: string,
    entityId: string,
    dto: BulkSetCustomFieldValuesDto,
  ): Promise<void> {
    for (const item of dto.values) {
      // Verify definition exists and belongs to this tenant + entity type
      const def = await this.defRepo.findOne({
        where: { id: item.fieldDefinitionId, tenantId, entityType: entityType as CustomFieldEntityType },
      });
      if (!def) continue;

      const stringValue = item.value == null ? null : String(item.value);

      const existing = await this.valRepo.findOne({
        where: { tenantId, entityType, entityId, fieldDefinitionId: item.fieldDefinitionId },
      });

      if (existing) {
        existing.value = stringValue;
        await this.valRepo.save(existing);
      } else {
        await this.valRepo.save(
          this.valRepo.create({
            tenantId,
            entityType,
            entityId,
            fieldDefinitionId: item.fieldDefinitionId,
            value: stringValue,
          }),
        );
      }
    }
  }

  private castValue(raw: string | null, type: CustomFieldType): any {
    if (raw === null || raw === undefined) return null;
    switch (type) {
      case CustomFieldType.NUMBER:
        return Number(raw);
      case CustomFieldType.CHECKBOX:
        return raw === 'true' || raw === '1';
      case CustomFieldType.MULTI_SELECT:
        try { return JSON.parse(raw); } catch { return []; }
      default:
        return raw;
    }
  }
}
