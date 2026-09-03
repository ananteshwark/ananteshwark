import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SequenceService } from '../../../common/sequence/sequence.service';
import {
  CtoOptionMapping,
  CtoAction,
  CtoConfiguration,
  CtoStatus,
  CtoVariantComponent,
} from './entities/cto.entity';

@Injectable()
export class CtoService {
  constructor(
    @InjectRepository(CtoOptionMapping) private readonly mappings: Repository<CtoOptionMapping>,
    @InjectRepository(CtoConfiguration) private readonly configs: Repository<CtoConfiguration>,
    private readonly sequence: SequenceService,
  ) {}

  // ---- Option → component mappings ----------------------------------------
  listMappings(tenantId: string, modelCode?: string) {
    const where: any = { tenantId };
    if (modelCode) where.modelCode = modelCode;
    return this.mappings.find({ where, order: { modelCode: 'ASC', optionCode: 'ASC' } });
  }

  async createMapping(tenantId: string, dto: Partial<CtoOptionMapping>): Promise<CtoOptionMapping> {
    if (!dto.modelCode || !dto.optionCode || !dto.componentCode) {
      throw new BadRequestException('modelCode, optionCode and componentCode are required');
    }
    if (dto.action === CtoAction.SUBSTITUTE && !dto.substituteForCode) {
      throw new BadRequestException('substituteForCode is required for SUBSTITUTE mappings');
    }
    const m = this.mappings.create({
      tenantId,
      modelCode: dto.modelCode,
      optionCode: dto.optionCode,
      action: dto.action ?? CtoAction.ADD,
      componentCode: dto.componentCode,
      componentName: dto.componentName ?? dto.componentCode,
      quantity: dto.quantity ?? 1,
      uom: dto.uom ?? 'EA',
      substituteForCode: dto.substituteForCode ?? null,
    });
    return this.mappings.save(m);
  }

  async deleteMapping(tenantId: string, id: string): Promise<void> {
    const m = await this.mappings.findOne({ where: { id, tenantId } });
    if (!m) throw new NotFoundException(`Mapping ${id} not found`);
    await this.mappings.remove(m);
  }

  /**
   * Explode a configured model into a concrete variant BOM. Starts from the
   * BASE components and applies each selected option's mappings in order:
   * ADD appends, REMOVE drops a matching component, SUBSTITUTE swaps a base
   * component for another. Quantities of duplicate ADDs accumulate.
   */
  async explode(tenantId: string, modelCode: string, selectedOptions: string[]): Promise<CtoVariantComponent[]> {
    const all = await this.mappings.find({ where: { tenantId, modelCode } });
    if (all.length === 0) throw new NotFoundException(`No CTO mappings defined for model ${modelCode}`);

    const components: CtoVariantComponent[] = [];
    const add = (code: string, name: string, qty: number, uom: string, source: string) => {
      const existing = components.find((c) => c.componentCode === code);
      if (existing) existing.quantity += qty;
      else components.push({ componentCode: code, componentName: name, quantity: qty, uom, source });
    };

    // 1. BASE components
    for (const m of all.filter((x) => x.optionCode === 'BASE' && x.action === CtoAction.ADD)) {
      add(m.componentCode, m.componentName, Number(m.quantity), m.uom, 'BASE');
    }

    // 2. Apply option mappings in the order options were selected
    for (const opt of selectedOptions) {
      const optMaps = all.filter((x) => x.optionCode === opt);
      for (const m of optMaps) {
        if (m.action === CtoAction.ADD) {
          add(m.componentCode, m.componentName, Number(m.quantity), m.uom, opt);
        } else if (m.action === CtoAction.REMOVE) {
          const idx = components.findIndex((c) => c.componentCode === m.componentCode);
          if (idx >= 0) components.splice(idx, 1);
        } else if (m.action === CtoAction.SUBSTITUTE) {
          const idx = components.findIndex((c) => c.componentCode === m.substituteForCode);
          if (idx >= 0) components.splice(idx, 1);
          add(m.componentCode, m.componentName, Number(m.quantity), m.uom, opt);
        }
      }
    }

    return components;
  }

  // ---- Configurations ------------------------------------------------------
  private variantItemCode(modelCode: string, selectedOptions: string[]): string {
    const suffix = [...selectedOptions].sort().join('-');
    return suffix ? `${modelCode}-${suffix}` : modelCode;
  }

  async createConfiguration(
    tenantId: string,
    dto: {
      modelCode: string;
      modelName?: string;
      selectedOptions?: string[];
      unitPrice?: number;
      quantity?: number;
      salesOrderLineId?: string;
    },
  ): Promise<CtoConfiguration> {
    if (!dto.modelCode) throw new BadRequestException('modelCode is required');
    const selectedOptions = dto.selectedOptions ?? [];
    const variantBom = await this.explode(tenantId, dto.modelCode, selectedOptions);

    const configNumber = await this.sequence.formatted(tenantId, 'cto-config', 'CTO-', 6);

    const cfg = this.configs.create({
      tenantId,
      configNumber,
      modelCode: dto.modelCode,
      modelName: dto.modelName ?? null,
      salesOrderLineId: dto.salesOrderLineId ?? null,
      variantItemCode: this.variantItemCode(dto.modelCode, selectedOptions),
      selectedOptions,
      variantBom,
      unitPrice: dto.unitPrice ?? 0,
      quantity: dto.quantity ?? 1,
      status: CtoStatus.CONFIGURED,
    });
    return this.configs.save(cfg);
  }

  listConfigurations(tenantId: string) {
    return this.configs.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getConfiguration(tenantId: string, id: string): Promise<CtoConfiguration> {
    const cfg = await this.configs.findOne({ where: { id, tenantId } });
    if (!cfg) throw new NotFoundException(`Configuration ${id} not found`);
    return cfg;
  }

  /**
   * Release the configured variant to supply: stamps a work-order number and
   * flips status to RELEASED. The exploded variant BOM travels with the record
   * so downstream manufacturing can build the exact configured item.
   */
  async release(tenantId: string, id: string): Promise<CtoConfiguration> {
    const cfg = await this.getConfiguration(tenantId, id);
    if (cfg.status === CtoStatus.RELEASED) return cfg;
    if (cfg.status === CtoStatus.CANCELLED) throw new BadRequestException('Cannot release a cancelled configuration');
    if (!cfg.variantBom || cfg.variantBom.length === 0) throw new BadRequestException('Variant BOM is empty; nothing to release');
    cfg.workOrderNumber = await this.sequence.formatted(tenantId, 'cto-work-order', 'CTO-WO-', 6);
    cfg.status = CtoStatus.RELEASED;
    return this.configs.save(cfg);
  }

  async cancel(tenantId: string, id: string): Promise<CtoConfiguration> {
    const cfg = await this.getConfiguration(tenantId, id);
    if (cfg.status === CtoStatus.RELEASED) throw new BadRequestException('Cannot cancel a released configuration');
    cfg.status = CtoStatus.CANCELLED;
    return this.configs.save(cfg);
  }
}
