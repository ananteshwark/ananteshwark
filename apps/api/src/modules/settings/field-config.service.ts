import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldConfig } from './field-config.entity';
import { FIELD_DEFAULTS, FieldDef } from './field-defaults';
import { UpdateFieldItemDto } from './dto/field-config.dto';

@Injectable()
export class FieldConfigService {
  constructor(
    @InjectRepository(FieldConfig)
    private readonly repo: Repository<FieldConfig>,
  ) {}

  async getModuleConfig(tenantId: string, module: string): Promise<(FieldDef & { customLabel: string | null })[]> {
    const defaults = FIELD_DEFAULTS[module] ?? [];
    const saved = await this.repo.find({ where: { tenantId, module } });
    const savedMap = Object.fromEntries(saved.map(s => [s.field, s]));
    return defaults.map(def => {
      const s = savedMap[def.field];
      return {
        ...def,
        enabled: s ? s.enabled : def.enabled,
        required: s ? s.required : def.required,
        customLabel: s?.customLabel ?? null,
      };
    });
  }

  async updateModuleConfig(tenantId: string, module: string, items: UpdateFieldItemDto[]): Promise<any[]> {
    for (const item of items) {
      await this.repo.upsert(
        {
          tenantId,
          module,
          field: item.field,
          enabled: item.enabled,
          required: item.required,
          customLabel: item.customLabel ?? null,
        },
        { conflictPaths: ['tenantId', 'module', 'field'] },
      );
    }
    return this.getModuleConfig(tenantId, module);
  }

  async getAllModulesConfig(tenantId: string): Promise<Record<string, any[]>> {
    const result: Record<string, any[]> = {};
    for (const module of Object.keys(FIELD_DEFAULTS)) {
      result[module] = await this.getModuleConfig(tenantId, module);
    }
    return result;
  }

  async getConfigMap(tenantId: string, module: string): Promise<Record<string, { enabled: boolean; required: boolean; label: string }>> {
    const configs = await this.getModuleConfig(tenantId, module);
    return Object.fromEntries(
      configs.map(c => [c.field, { enabled: c.enabled, required: c.required, label: c.customLabel ?? c.label }])
    );
  }
}
