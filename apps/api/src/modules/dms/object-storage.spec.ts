import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { ObjectStorageAdapter } from './object-storage.adapter';
import { AttachmentService } from './attachment.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue(undefined),
});

describe('ObjectStorageAdapter', () => {
  let root: string;
  let adapter: ObjectStorageAdapter;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-test-'));
    process.env.DMS_STORAGE_DIR = root;
    adapter = new ObjectStorageAdapter();
  });

  afterEach(() => {
    delete process.env.DMS_STORAGE_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('round-trips put → get → remove by key', async () => {
    const key = 't1/expense/e1/file.txt';
    await adapter.put(key, Buffer.from('hello'));
    expect((await adapter.get(key))?.toString()).toBe('hello');
    expect(await adapter.remove(key)).toBe(true);
    expect(await adapter.get(key)).toBeNull();
  });

  it('refuses path traversal in keys', async () => {
    await expect(adapter.put('../escape.txt', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
  });

  it('still reads legacy rows that stored a raw filesystem path', async () => {
    const legacy = path.join(root, 'legacy-file.bin');
    fs.writeFileSync(legacy, Buffer.from('old-style'));
    expect((await adapter.get(legacy))?.toString()).toBe('old-style');
    expect(await adapter.remove(legacy)).toBe(true);
  });
});

describe('AttachmentService with the storage seam', () => {
  let root: string;
  let repo: any;
  let service: AttachmentService;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-svc-'));
    process.env.DMS_STORAGE_DIR = root;
    repo = mockRepo();
    service = new AttachmentService(repo, new ObjectStorageAdapter());
  });

  afterEach(() => {
    delete process.env.DMS_STORAGE_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stores by backend-agnostic key and serves content back', async () => {
    const saved = await service.upload('t1', 'expense', 'e1', 'u1', {
      originalname: 'receipt.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF'),
    });
    expect(saved.storagePath).toMatch(/^t1\/expense\/e1\//); // key, not a filesystem path
    repo.findOne.mockResolvedValue(saved);
    const { attachment, buffer } = await service.getContent('t1', saved.id);
    expect(attachment.originalName).toBe('receipt.pdf');
    expect(buffer.toString()).toBe('%PDF');
  });

  it('delete removes the stored object along with the row', async () => {
    const saved = await service.upload('t1', 'expense', 'e1', 'u1', {
      originalname: 'a.txt', mimetype: 'text/plain', size: 2, buffer: Buffer.from('hi'),
    });
    repo.findOne.mockResolvedValue(saved);
    await service.delete('t1', saved.id);
    expect(fs.existsSync(path.join(root, saved.storagePath))).toBe(false);
    expect(repo.delete).toHaveBeenCalledWith({ id: saved.id, tenantId: 't1' });
  });

  it('missing content raises NotFound rather than a broken download', async () => {
    repo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', storagePath: 't1/x/y/gone.txt', originalName: 'gone.txt' });
    await expect(service.getContent('t1', 'a1')).rejects.toThrow(NotFoundException);
  });
});
