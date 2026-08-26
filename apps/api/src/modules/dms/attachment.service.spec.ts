import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { AttachmentService } from './attachment.service';

/**
 * Attachments: uploads sanitize the filename and store under a
 * tenant/entity-scoped path; delete removes the file best-effort and always
 * clears the tenant-scoped DB row. fs is spied (not module-mocked) because
 * TypeORM itself needs the real fs at import time.
 */
describe('AttachmentService', () => {
  let service: AttachmentService;
  let repo: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);
    repo = {
      create: jest.fn((x) => ({ id: 'att-1', ...x })),
      save: jest.fn((x) => Promise.resolve(x)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new AttachmentService(repo);
  });

  const file = { originalname: '../..\\evil report.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x') };

  it('upload writes into a tenant/entity directory and strips path separators from the name', async () => {
    const att = await service.upload('t1', 'invoice', 'inv-1', 'u1', file, 'Q2 report');
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('t1'), { recursive: true });
    const writtenPath = (fs.writeFileSync as jest.Mock).mock.calls[0][0] as string;
    expect(writtenPath).toContain('_.._.._evil report.pdf'); // separators replaced
    expect(att.originalName).toBe(file.originalname); // original preserved in metadata
    expect(att.tenantId).toBe('t1');
  });

  it('findById is tenant-scoped and 404s on a foreign attachment', async () => {
    await expect(service.findById('t2', 'att-1')).rejects.toThrow(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'att-1', tenantId: 't2' } });
  });

  it('delete unlinks the stored file and removes the row', async () => {
    repo.findOne.mockResolvedValue({ id: 'att-1', tenantId: 't1', storagePath: '/uploads/t1/x' });
    const r = await service.delete('t1', 'att-1');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/uploads/t1/x');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'att-1', tenantId: 't1' });
    expect(r).toEqual({ deleted: true });
  });

  it('delete still removes the DB row when the file unlink fails', async () => {
    repo.findOne.mockResolvedValue({ id: 'att-1', tenantId: 't1', storagePath: '/uploads/t1/x' });
    (fs.unlinkSync as jest.Mock).mockImplementation(() => { throw new Error('EPERM'); });
    const r = await service.delete('t1', 'att-1');
    expect(repo.delete).toHaveBeenCalled();
    expect(r).toEqual({ deleted: true });
  });

  it('rejects traversal-shaped entity identifiers with 400 (not a 500 from the storage layer)', async () => {
    const { BadRequestException } = require('@nestjs/common');
    await expect(
      service.upload('t1', 'expense', '../../etc', 'u1', file as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upload('t1', '../secrets', 'e1', 'u1', file as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
