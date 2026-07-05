import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LetterTemplate, IssuedLetter, IssuedLetterStatus } from './entities/letter.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class LettersService {
  constructor(
    @InjectRepository(LetterTemplate) private readonly templateRepo: Repository<LetterTemplate>,
    @InjectRepository(IssuedLetter) private readonly issuedRepo: Repository<IssuedLetter>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Templates ────────────────────────────────────────────────

  async createTemplate(tenantId: string, dto: Partial<LetterTemplate>): Promise<LetterTemplate> {
    if (!dto.code?.trim()) throw new BadRequestException('Template code is required');
    if (!dto.body?.trim()) throw new BadRequestException('Template body is required');
    const template = this.templateRepo.create({ ...dto, tenantId });
    return this.templateRepo.save(template);
  }

  async listTemplates(tenantId: string, activeOnly = false): Promise<LetterTemplate[]> {
    return this.templateRepo.find({
      where: activeOnly ? { tenantId, isActive: true } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateTemplate(tenantId: string, id: string, dto: Partial<LetterTemplate>): Promise<LetterTemplate> {
    const template = await this.templateRepo.findOne({ where: { id, tenantId } });
    if (!template) throw new NotFoundException(`Letter template ${id} not found`);
    Object.assign(template, dto, { id: template.id, tenantId });
    return this.templateRepo.save(template);
  }

  /** Distinct {{placeholders}} referenced by a template (subject + body). */
  extractPlaceholders(template: Pick<LetterTemplate, 'subject' | 'body'>): string[] {
    const found = new Set<string>();
    const pattern = /\{\{\s*([\w.]+)\s*\}\}/g;
    for (const source of [template.subject ?? '', template.body ?? '']) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) found.add(match[1]);
    }
    return Array.from(found);
  }

  // ─── Generation & issuance ────────────────────────────────────

  private render(text: string, data: Record<string, any>): string {
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const value = data[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  /** Standard merge fields available to every template, from the employee record. */
  private employeeMergeFields(employee: Employee): Record<string, any> {
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
    return {
      employeeName: fullName,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeCode: employee.employeeCode,
      email: employee.email,
      dateOfJoining: (employee as any).dateOfJoining ?? '',
      today: new Date().toISOString().slice(0, 10),
    };
  }

  private async nextLetterNumber(tenantId: string): Promise<string> {
    const row = await this.issuedRepo
      .createQueryBuilder('l')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(l.letter_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('l.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `LTR-${String(next).padStart(6, '0')}`;
  }

  /** Render a template against an employee (+ any custom data) into a DRAFT letter. */
  async generate(
    tenantId: string,
    dto: { templateId: string; employeeId: string; data?: Record<string, any> },
  ): Promise<IssuedLetter> {
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId, tenantId } });
    if (!template) throw new NotFoundException(`Letter template ${dto.templateId} not found`);
    if (!template.isActive) throw new BadRequestException(`Template "${template.name}" is inactive`);
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId, tenantId } });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeId} not found`);

    // Custom data wins over standard fields so HR can override anything.
    const mergeData = { ...this.employeeMergeFields(employee), ...(dto.data ?? {}) };
    const letterNumber = await this.nextLetterNumber(tenantId);
    const letter = this.issuedRepo.create({
      tenantId,
      letterNumber,
      templateId: template.id,
      templateName: template.name,
      letterType: template.type,
      employeeId: employee.id,
      employeeName: mergeData.employeeName,
      renderedSubject: this.render(template.subject, mergeData),
      renderedBody: this.render(template.body, mergeData),
      status: IssuedLetterStatus.DRAFT,
    });
    return this.issuedRepo.save(letter);
  }

  async listIssued(tenantId: string, employeeId?: string): Promise<IssuedLetter[]> {
    return this.issuedRepo.find({
      where: employeeId ? { tenantId, employeeId } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getIssued(tenantId: string, id: string): Promise<IssuedLetter> {
    const letter = await this.issuedRepo.findOne({ where: { id, tenantId } });
    if (!letter) throw new NotFoundException(`Letter ${id} not found`);
    return letter;
  }

  async issue(tenantId: string, id: string, issuedByUserId: string): Promise<IssuedLetter> {
    const letter = await this.getIssued(tenantId, id);
    if (letter.status !== IssuedLetterStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT letters can be issued (current: ${letter.status})`);
    }
    letter.status = IssuedLetterStatus.ISSUED;
    letter.issuedByUserId = issuedByUserId;
    letter.issuedAt = new Date();
    const saved = await this.issuedRepo.save(letter);
    await this.automation?.emit(tenantId, 'letter.issued', {
      letterId: saved.id, letterNumber: saved.letterNumber, letterType: saved.letterType,
      employeeId: saved.employeeId, employeeName: saved.employeeName,
    });
    return saved;
  }

  async revoke(tenantId: string, id: string): Promise<IssuedLetter> {
    const letter = await this.getIssued(tenantId, id);
    if (letter.status !== IssuedLetterStatus.ISSUED) {
      throw new BadRequestException(`Only ISSUED letters can be revoked (current: ${letter.status})`);
    }
    letter.status = IssuedLetterStatus.REVOKED;
    return this.issuedRepo.save(letter);
  }
}
