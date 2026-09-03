import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormDefinition, FormStatus, FormField, FormFieldType, FormSubmission } from './entities/form.entity';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class FormsService {
  constructor(
    @InjectRepository(FormDefinition) private readonly formRepo: Repository<FormDefinition>,
    @InjectRepository(FormSubmission) private readonly submissionRepo: Repository<FormSubmission>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Definitions ──────────────────────────────────────────────

  async createForm(tenantId: string, dto: { key: string; name: string; description?: string; fields?: FormField[] }): Promise<FormDefinition> {
    if (!dto.key?.trim() || !dto.name?.trim()) throw new BadRequestException('key and name are required');
    const existing = await this.formRepo.findOne({ where: { tenantId, key: dto.key.trim() } });
    if (existing) throw new BadRequestException(`Form key "${dto.key}" already exists`);
    return this.formRepo.save(this.formRepo.create({
      tenantId, key: dto.key.trim(), name: dto.name.trim(), description: dto.description ?? null,
      fields: this.validateFieldSchema(dto.fields ?? []), status: FormStatus.DRAFT, version: 1,
    }));
  }

  private validateFieldSchema(fields: FormField[]): FormField[] {
    const seen = new Set<string>();
    return (fields ?? []).map((f) => {
      if (!f.key?.trim()) throw new BadRequestException('Every field needs a key');
      if (seen.has(f.key)) throw new BadRequestException(`Duplicate field key "${f.key}"`);
      seen.add(f.key);
      if (!Object.values(FormFieldType).includes(f.type)) throw new BadRequestException(`Unknown field type for "${f.key}"`);
      if ((f.type === FormFieldType.SELECT || f.type === FormFieldType.MULTISELECT) && !(f.options?.length)) {
        throw new BadRequestException(`Field "${f.key}" of type ${f.type} needs options`);
      }
      return f;
    });
  }

  listForms(tenantId: string, status?: FormStatus): Promise<FormDefinition[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.formRepo.find({ where, order: { name: 'ASC' } });
  }

  async getForm(tenantId: string, id: string): Promise<FormDefinition> {
    const form = await this.formRepo.findOne({ where: { id, tenantId } });
    if (!form) throw new NotFoundException(`Form ${id} not found`);
    return form;
  }

  async updateForm(tenantId: string, id: string, dto: { name?: string; description?: string; fields?: FormField[] }): Promise<FormDefinition> {
    const form = await this.getForm(tenantId, id);
    if (form.status !== FormStatus.DRAFT) throw new BadRequestException('Only DRAFT forms can be edited; publish creates a new version');
    if (dto.name !== undefined) form.name = dto.name.trim();
    if (dto.description !== undefined) form.description = dto.description;
    if (dto.fields !== undefined) form.fields = this.validateFieldSchema(dto.fields);
    return this.formRepo.save(form);
  }

  async publish(tenantId: string, id: string): Promise<FormDefinition> {
    const form = await this.getForm(tenantId, id);
    if (form.status === FormStatus.PUBLISHED) throw new BadRequestException('Form is already published');
    if (!form.fields.length) throw new BadRequestException('Add at least one field before publishing');
    form.status = FormStatus.PUBLISHED;
    form.publishedAt = new Date();
    const saved = await this.formRepo.save(form);
    await this.automation?.emit(tenantId, 'form.published', { formId: saved.id, key: saved.key, version: saved.version });
    return saved;
  }

  async archive(tenantId: string, id: string): Promise<FormDefinition> {
    const form = await this.getForm(tenantId, id);
    form.status = FormStatus.ARCHIVED;
    return this.formRepo.save(form);
  }

  // ─── Validation & submissions ─────────────────────────────────

  /**
   * Validate a value map against a form's field schema. Returns per-field
   * errors; an empty array means the submission is valid.
   */
  validate(fields: FormField[], values: Record<string, any>): Array<{ field: string; error: string }> {
    const errors: Array<{ field: string; error: string }> = [];
    for (const f of fields) {
      const v = values?.[f.key];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) {
        if (f.required) errors.push({ field: f.key, error: 'is required' });
        continue;
      }
      switch (f.type) {
        case FormFieldType.NUMBER: {
          const n = Number(v);
          if (!Number.isFinite(n)) { errors.push({ field: f.key, error: 'must be a number' }); break; }
          if (f.min != null && n < f.min) errors.push({ field: f.key, error: `must be ≥ ${f.min}` });
          if (f.max != null && n > f.max) errors.push({ field: f.key, error: `must be ≤ ${f.max}` });
          break;
        }
        case FormFieldType.EMAIL:
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v))) errors.push({ field: f.key, error: 'must be a valid email' });
          break;
        case FormFieldType.DATE:
          if (Number.isNaN(Date.parse(String(v)))) errors.push({ field: f.key, error: 'must be a valid date' });
          break;
        case FormFieldType.SELECT:
          if (!f.options?.includes(String(v))) errors.push({ field: f.key, error: 'is not a permitted option' });
          break;
        case FormFieldType.MULTISELECT: {
          const arr = Array.isArray(v) ? v : [v];
          if (arr.some((x) => !f.options?.includes(String(x)))) errors.push({ field: f.key, error: 'contains a non-permitted option' });
          break;
        }
        case FormFieldType.TEXT:
        case FormFieldType.TEXTAREA: {
          const s = String(v);
          if (f.min != null && s.length < f.min) errors.push({ field: f.key, error: `must be at least ${f.min} characters` });
          if (f.max != null && s.length > f.max) errors.push({ field: f.key, error: `must be at most ${f.max} characters` });
          if (f.pattern && !new RegExp(f.pattern).test(s)) errors.push({ field: f.key, error: 'does not match the required format' });
          break;
        }
        default:
          break;
      }
    }
    return errors;
  }

  async submit(tenantId: string, formId: string, dto: { values: Record<string, any>; submittedByUserId?: string; subjectRef?: string }): Promise<FormSubmission> {
    const form = await this.getForm(tenantId, formId);
    if (form.status !== FormStatus.PUBLISHED) throw new BadRequestException('Submissions are only accepted on a PUBLISHED form');
    const errors = this.validate(form.fields, dto.values ?? {});
    if (errors.length) throw new BadRequestException({ message: 'Validation failed', errors });
    const submission = await this.submissionRepo.save(this.submissionRepo.create({
      tenantId, formId, formVersion: form.version, submittedByUserId: dto.submittedByUserId ?? null,
      subjectRef: dto.subjectRef ?? null, values: dto.values ?? {},
    }));
    await this.automation?.emit(tenantId, 'form.submitted', { formId, key: form.key, submissionId: submission.id });
    return submission;
  }

  listSubmissions(tenantId: string, formId: string): Promise<FormSubmission[]> {
    return this.submissionRepo.find({ where: { tenantId, formId }, order: { createdAt: 'DESC' } });
  }
}
