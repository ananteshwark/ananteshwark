import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LettersService } from './letters.service';
import { IssuedLetterStatus, LetterType } from './entities/letter.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: null }),
  })),
});

describe('LettersService', () => {
  let service: LettersService;
  let templateRepo: any, issuedRepo: any, employeeRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  const template = {
    id: 'tpl-1', tenantId: 't1', code: 'CONF', name: 'Confirmation Letter',
    type: LetterType.CONFIRMATION, isActive: true,
    subject: 'Confirmation — {{employeeName}}',
    body: 'Dear {{firstName}}, employee {{employeeCode}} is confirmed effective {{effectiveDate}}. Dated {{today}}.',
  };
  const employee = {
    id: 'e1', tenantId: 't1', firstName: 'Asha', lastName: 'Rao',
    employeeCode: 'EMP-001', email: 'asha@x.com', dateOfJoining: '2024-01-15',
  };

  beforeEach(() => {
    templateRepo = mockRepo();
    issuedRepo = mockRepo();
    employeeRepo = mockRepo();
    automation.emit.mockClear();
    service = new LettersService(templateRepo, issuedRepo, employeeRepo, automation as any);
  });

  it('extracts distinct placeholders from subject and body', () => {
    expect(service.extractPlaceholders(template).sort()).toEqual(
      ['effectiveDate', 'employeeCode', 'employeeName', 'firstName', 'today'],
    );
  });

  it('generates a DRAFT letter merging employee fields with custom data overrides', async () => {
    templateRepo.findOne.mockResolvedValue({ ...template });
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const letter = await service.generate('t1', {
      templateId: 'tpl-1', employeeId: 'e1', data: { effectiveDate: '2026-08-01' },
    });
    expect(letter.letterNumber).toBe('LTR-000001');
    expect(letter.status).toBe(IssuedLetterStatus.DRAFT);
    expect(letter.renderedSubject).toBe('Confirmation — Asha Rao');
    expect(letter.renderedBody).toContain('Dear Asha, employee EMP-001 is confirmed effective 2026-08-01');
    expect(letter.renderedBody).not.toContain('{{'); // everything resolved
  });

  it('custom data wins over standard merge fields', async () => {
    templateRepo.findOne.mockResolvedValue({ ...template });
    employeeRepo.findOne.mockResolvedValue({ ...employee });
    const letter = await service.generate('t1', {
      templateId: 'tpl-1', employeeId: 'e1',
      data: { effectiveDate: 'x', employeeName: 'Ms. Asha Rao (HR override)' },
    });
    expect(letter.renderedSubject).toContain('HR override');
  });

  it('refuses inactive templates and unknown employees', async () => {
    templateRepo.findOne.mockResolvedValue({ ...template, isActive: false });
    await expect(service.generate('t1', { templateId: 'tpl-1', employeeId: 'e1' }))
      .rejects.toThrow(BadRequestException);
    templateRepo.findOne.mockResolvedValue({ ...template });
    employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.generate('t1', { templateId: 'tpl-1', employeeId: 'nope' }))
      .rejects.toThrow(NotFoundException);
  });

  it('issue stamps issuer + time and emits letter.issued; revoke only from ISSUED', async () => {
    issuedRepo.findOne.mockResolvedValue({
      id: 'l1', tenantId: 't1', letterNumber: 'LTR-000009', letterType: LetterType.CONFIRMATION,
      employeeId: 'e1', employeeName: 'Asha Rao', status: IssuedLetterStatus.DRAFT,
    });
    const issued = await service.issue('t1', 'l1', 'hr-user');
    expect(issued.issuedByUserId).toBe('hr-user');
    expect(issued.issuedAt).toBeInstanceOf(Date);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'letter.issued', expect.objectContaining({ letterNumber: 'LTR-000009' }));

    issuedRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: IssuedLetterStatus.DRAFT });
    await expect(service.revoke('t1', 'l1')).rejects.toThrow('Only ISSUED letters');
  });
});
