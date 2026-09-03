import { BadRequestException } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormFieldType, FormStatus, FormField } from './entities/form.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('FormsService', () => {
  let service: FormsService;
  let formRepo: any, submissionRepo: any, automation: any;

  beforeEach(() => {
    formRepo = mockRepo(); submissionRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new FormsService(formRepo, submissionRepo, automation);
  });

  describe('schema validation on create', () => {
    it('rejects duplicate field keys', async () => {
      formRepo.findOne.mockResolvedValue(null);
      await expect(service.createForm('t1', { key: 'f', name: 'F', fields: [
        { key: 'a', label: 'A', type: FormFieldType.TEXT }, { key: 'a', label: 'A2', type: FormFieldType.TEXT },
      ] as FormField[] })).rejects.toThrow(BadRequestException);
    });

    it('requires options on a SELECT field', async () => {
      formRepo.findOne.mockResolvedValue(null);
      await expect(service.createForm('t1', { key: 'f', name: 'F', fields: [
        { key: 'a', label: 'A', type: FormFieldType.SELECT } as FormField,
      ] })).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate form key', async () => {
      formRepo.findOne.mockResolvedValue({ id: 'x' });
      await expect(service.createForm('t1', { key: 'f', name: 'F' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('validate()', () => {
    const fields: FormField[] = [
      { key: 'name', label: 'Name', type: FormFieldType.TEXT, required: true, min: 2, max: 10 },
      { key: 'age', label: 'Age', type: FormFieldType.NUMBER, min: 18, max: 99 },
      { key: 'email', label: 'Email', type: FormFieldType.EMAIL },
      { key: 'color', label: 'Colour', type: FormFieldType.SELECT, options: ['red', 'blue'] },
      { key: 'tags', label: 'Tags', type: FormFieldType.MULTISELECT, options: ['x', 'y'] },
    ];

    it('passes a valid payload', () => {
      expect(service.validate(fields, { name: 'Ann', age: 30, email: 'a@b.com', color: 'red', tags: ['x'] })).toEqual([]);
    });

    it('flags required, range, email and option errors', () => {
      const errs = service.validate(fields, { age: 5, email: 'nope', color: 'green', tags: ['z'] });
      const byField = Object.fromEntries(errs.map((e) => [e.field, e.error]));
      expect(byField.name).toMatch(/required/);
      expect(byField.age).toMatch(/≥ 18/);
      expect(byField.email).toMatch(/valid email/);
      expect(byField.color).toMatch(/permitted option/);
      expect(byField.tags).toMatch(/non-permitted/);
    });

    it('enforces text length bounds', () => {
      const errs = service.validate(fields, { name: 'A' });
      expect(errs.find((e) => e.field === 'name')!.error).toMatch(/at least 2/);
    });
  });

  describe('lifecycle & submit', () => {
    it('publishes a form, bumping status and emitting form.published', async () => {
      formRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', key: 'k', version: 1, status: FormStatus.DRAFT, fields: [{ key: 'a', label: 'A', type: FormFieldType.TEXT }] });
      const pub = await service.publish('t1', 'f1');
      expect(pub.status).toBe(FormStatus.PUBLISHED);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'form.published', expect.objectContaining({ key: 'k' }));
    });

    it('refuses to edit a published form', async () => {
      formRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FormStatus.PUBLISHED, fields: [] });
      await expect(service.updateForm('t1', 'f1', { name: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid submission and accepts a valid one', async () => {
      const form = { id: 'f1', tenantId: 't1', key: 'k', version: 2, status: FormStatus.PUBLISHED, fields: [{ key: 'name', label: 'Name', type: FormFieldType.TEXT, required: true }] };
      formRepo.findOne.mockResolvedValue(form);
      await expect(service.submit('t1', 'f1', { values: {} })).rejects.toThrow(BadRequestException);

      const sub = await service.submit('t1', 'f1', { values: { name: 'Ann' }, submittedByUserId: 'u1' });
      expect(sub).toMatchObject({ formId: 'f1', formVersion: 2 });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'form.submitted', expect.objectContaining({ key: 'k' }));
    });

    it('refuses submission on a non-published form', async () => {
      formRepo.findOne.mockResolvedValue({ id: 'f1', tenantId: 't1', status: FormStatus.DRAFT, fields: [] });
      await expect(service.submit('t1', 'f1', { values: {} })).rejects.toThrow(BadRequestException);
    });
  });
});
