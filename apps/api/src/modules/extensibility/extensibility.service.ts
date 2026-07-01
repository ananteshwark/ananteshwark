import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomObject, CustomFieldDef } from './entities/custom-object.entity';
import { CustomRecord } from './entities/custom-record.entity';
import { ValidationRule } from './entities/validation-rule.entity';

const FIELD_TYPES = ['string', 'number', 'boolean', 'date'];

/** Ph-292 — pre-built vertical marketplace packs. */
const MARKETPLACE: Record<string, { name: string; vertical: string; objects: Array<Partial<CustomObject>> }> = {
  RETAIL: { name: 'Retail Pack', vertical: 'RETAIL', objects: [
    { name: 'Store', apiName: 'store', sidebarLabel: 'Stores', fields: [{ name: 'code', label: 'Code', type: 'string', required: true }, { name: 'sqft', label: 'Sq Ft', type: 'number' }], listViewColumns: ['code', 'sqft'] },
    { name: 'Planogram', apiName: 'planogram', sidebarLabel: 'Planograms', fields: [{ name: 'aisle', label: 'Aisle', type: 'string', required: true }], listViewColumns: ['aisle'] },
  ] },
  CONSTRUCTION: { name: 'Construction Pack', vertical: 'CONSTRUCTION', objects: [
    { name: 'Job Site', apiName: 'job_site', sidebarLabel: 'Job Sites', fields: [{ name: 'siteCode', label: 'Site Code', type: 'string', required: true }, { name: 'permitNo', label: 'Permit', type: 'string' }], listViewColumns: ['siteCode', 'permitNo'] },
  ] },
  HEALTHCARE: { name: 'Healthcare Pack', vertical: 'HEALTHCARE', objects: [
    { name: 'Patient', apiName: 'patient', sidebarLabel: 'Patients', fields: [{ name: 'mrn', label: 'MRN', type: 'string', required: true }], listViewColumns: ['mrn'] },
  ] },
  NONPROFIT: { name: 'Nonprofit Pack', vertical: 'NONPROFIT', objects: [
    { name: 'Donor', apiName: 'donor', sidebarLabel: 'Donors', fields: [{ name: 'name', label: 'Name', type: 'string', required: true }, { name: 'lifetimeGiving', label: 'Lifetime Giving', type: 'number' }], listViewColumns: ['name', 'lifetimeGiving'] },
  ] },
};

@Injectable()
export class ExtensibilityService {
  constructor(
    @InjectRepository(CustomObject) private readonly objectRepo: Repository<CustomObject>,
    @InjectRepository(CustomRecord) private readonly recordRepo: Repository<CustomRecord>,
    @InjectRepository(ValidationRule) private readonly ruleRepo: Repository<ValidationRule>,
  ) {}

  // ─── Ph-289/290: custom objects ───────────────────────────────────

  listObjects(tenantId: string): Promise<CustomObject[]> {
    return this.objectRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async createObject(tenantId: string, data: Partial<CustomObject>, sourcePack: string | null = null): Promise<CustomObject> {
    if (!data.name?.trim() || !data.apiName?.trim()) throw new BadRequestException('name and apiName are required');
    if (!data.fields?.length) throw new BadRequestException('at least one field is required');
    for (const f of data.fields) {
      if (!f.name || !FIELD_TYPES.includes(f.type)) throw new BadRequestException(`invalid field "${f.name}" (type must be ${FIELD_TYPES.join('/')})`);
    }
    const dup = await this.objectRepo.findOne({ where: { tenantId, apiName: data.apiName } });
    if (dup) throw new BadRequestException('apiName already exists');
    const o = this.objectRepo.create({
      tenantId, name: data.name, apiName: data.apiName, fields: data.fields,
      listViewColumns: data.listViewColumns ?? data.fields.map((f) => f.name),
      sidebarLabel: data.sidebarLabel ?? data.name, icon: data.icon ?? null, sourcePack,
    } as any) as unknown as CustomObject;
    return (this.objectRepo.save(o) as unknown) as Promise<CustomObject>;
  }

  private async getObject(tenantId: string, id: string): Promise<CustomObject> {
    const o = await this.objectRepo.findOne({ where: { id, tenantId } });
    if (!o) throw new NotFoundException('Custom object not found');
    return o;
  }

  // ─── Ph-289/291: records with validation ──────────────────────────

  private typeOk(field: CustomFieldDef, value: any): boolean {
    if (value == null) return true;
    switch (field.type) {
      case 'number': return typeof value === 'number' && !Number.isNaN(value);
      case 'boolean': return typeof value === 'boolean';
      case 'string': return typeof value === 'string';
      case 'date': return typeof value === 'string' && !Number.isNaN(Date.parse(value));
      default: return false;
    }
  }

  private evalCondition(cond: { field: string; op: string; value: any }, data: Record<string, any>): boolean {
    const v = data[cond.field];
    switch (cond.op) {
      case 'eq': return v === cond.value;
      case 'ne': return v !== cond.value;
      case 'gt': return Number(v) > Number(cond.value);
      case 'gte': return Number(v) >= Number(cond.value);
      case 'lt': return Number(v) < Number(cond.value);
      case 'lte': return Number(v) <= Number(cond.value);
      case 'empty': return v == null || v === '';
      case 'notEmpty': return !(v == null || v === '');
      default: return false;
    }
  }

  async createRecord(tenantId: string, objectId: string, data: Record<string, any>): Promise<CustomRecord> {
    const obj = await this.getObject(tenantId, objectId);
    // Required + type validation.
    for (const f of obj.fields) {
      if (f.required && (data[f.name] == null || data[f.name] === '')) throw new BadRequestException(`Field "${f.name}" is required`);
      if (!this.typeOk(f, data[f.name])) throw new BadRequestException(`Field "${f.name}" must be a ${f.type}`);
    }
    // Tenant validation rules (condition describes an invalid state).
    const rules = await this.ruleRepo.find({ where: { tenantId, objectId, isActive: true } });
    for (const r of rules) {
      if (this.evalCondition(r.condition, data)) throw new BadRequestException(r.errorMessage);
    }
    const rec = this.recordRepo.create({ tenantId, objectId, data } as any) as unknown as CustomRecord;
    return (this.recordRepo.save(rec) as unknown) as Promise<CustomRecord>;
  }

  listRecords(tenantId: string, objectId: string): Promise<CustomRecord[]> {
    return this.recordRepo.find({ where: { tenantId, objectId }, order: { createdAt: 'DESC' } });
  }

  async addValidationRule(tenantId: string, objectId: string, data: { name: string; condition: any; errorMessage: string }): Promise<ValidationRule> {
    await this.getObject(tenantId, objectId);
    if (!data.condition?.field || !data.condition?.op) throw new BadRequestException('condition needs a field and op');
    if (!data.errorMessage?.trim()) throw new BadRequestException('errorMessage is required');
    const r = this.ruleRepo.create({ tenantId, objectId, name: data.name, condition: data.condition, errorMessage: data.errorMessage, isActive: true } as any) as unknown as ValidationRule;
    return (this.ruleRepo.save(r) as unknown) as Promise<ValidationRule>;
  }

  listRules(tenantId: string, objectId: string): Promise<ValidationRule[]> {
    return this.ruleRepo.find({ where: { tenantId, objectId } });
  }

  // ─── Ph-292: marketplace ──────────────────────────────────────────

  marketplaceCatalog(): any[] {
    return Object.entries(MARKETPLACE).map(([key, p]) => ({ key, name: p.name, vertical: p.vertical, objectCount: p.objects.length }));
  }

  /** Install a marketplace pack: create its custom objects (skipping existing). */
  async installPack(tenantId: string, key: string): Promise<any> {
    const pack = MARKETPLACE[key];
    if (!pack) throw new BadRequestException(`Unknown pack "${key}"`);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const def of pack.objects) {
      const exists = await this.objectRepo.findOne({ where: { tenantId, apiName: def.apiName as string } });
      if (exists) { skipped.push(def.apiName as string); continue; }
      await this.createObject(tenantId, def, key);
      created.push(def.apiName as string);
    }
    return { pack: key, created, skipped };
  }
}
