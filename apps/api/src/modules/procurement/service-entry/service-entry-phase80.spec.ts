import { BadRequestException } from '@nestjs/common';
import { ServiceEntryService } from './service-entry.service';
import { ServiceEntryStatus } from './entities/service-entry-sheet.entity';
import { mockRepo, mockDataSource } from '../../../test/mock-repo';

function makeService(overrides: Partial<Record<string, any>> = {}): ServiceEntryService {
  const poService = {
    findOne: jest.fn(async () => ({ id: 'po-1', lines: [] })),
    updateLineQuantityReceived: jest.fn(),
    updatePoStatus: jest.fn(),
  } as any;

  const grirService = {
    createGrEntry: jest.fn(async () => ({})),
  } as any;

  const glService = {
    postJournalEntry: jest.fn(async () => ({ id: 'je-ses' })),
    findAccounts: jest.fn(async () => ({ items: [] })),
  } as any;

  return new ServiceEntryService(
    overrides.repo ?? mockRepo(),
    overrides.poService ?? poService,
    overrides.grirService ?? grirService,
    overrides.glService ?? glService,
    overrides.dataSource ?? mockDataSource(),
  );
}

const baseSheet = {
  id: 'ses-1', tenantId: 't1', sheetNumber: 'SES-000001',
  poId: 'po-1', poLineId: null,
  description: 'Consulting services', quantity: 10, rate: 1000, amount: 10000,
  periodFrom: '2026-01-01', periodTo: '2026-01-31',
  status: ServiceEntryStatus.SUBMITTED,
  approvedBy: null, approvedAt: null, rejectionReason: null, journalEntryId: null,
};

// ─── Service Entry Sheet approve — transactional GL (Phase 80) ───────────────

describe('ServiceEntryService.approve — transactional GL (Phase 80)', () => {
  it('throws BadRequestException when sheet is not SUBMITTED', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue({ ...baseSheet, status: ServiceEntryStatus.DRAFT });
    const svc = makeService({ repo });
    await expect(svc.approve('t1', 'ses-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('posts GL transactionally when expense + GR/IR accounts are found', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue({ ...baseSheet });
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-ses' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'exp-acct' }] })  // service expense
        .mockResolvedValueOnce({ items: [{ id: 'grir-acct' }] }), // GR/IR
    };
    const grirService = { createGrEntry: jest.fn(async () => ({})) };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ repo, glService, grirService, dataSource: ds });

    const result = await svc.approve('t1', 'ses-1', 'user-1');

    expect(ds.transaction).toHaveBeenCalled();
    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'exp-acct', debit: 10000 }),
          expect.objectContaining({ accountId: 'grir-acct', credit: 10000 }),
        ]),
      }),
      'user-1',
      manager,
    );
    expect(result.journalEntryId).toBe('je-ses');
    expect(result.status).toBe(ServiceEntryStatus.APPROVED);
  });

  it('approves without GL when accounts are not found', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue({ ...baseSheet });
    const glService = {
      postJournalEntry: jest.fn(),
      findAccounts: jest.fn().mockResolvedValue({ items: [] }),
    };
    const grirService = { createGrEntry: jest.fn(async () => ({})) };
    const manager = { save: jest.fn(async (x: any) => ({ ...baseSheet, status: ServiceEntryStatus.APPROVED })) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ repo, glService, grirService, dataSource: ds });

    const result = await svc.approve('t1', 'ses-1', 'user-1');

    expect(glService.postJournalEntry).not.toHaveBeenCalled();
    expect(result.status).toBe(ServiceEntryStatus.APPROVED);
  });

  it('still returns saved sheet even when GR/IR creation throws', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue({ ...baseSheet });
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-ok' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'exp-acct' }] })
        .mockResolvedValueOnce({ items: [{ id: 'grir-acct' }] }),
    };
    const grirService = { createGrEntry: jest.fn().mockRejectedValue(new Error('GR/IR DB error')) };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ repo, glService, grirService, dataSource: ds });

    // Should not throw despite GR/IR failure (best-effort)
    const result = await svc.approve('t1', 'ses-1', 'user-1');
    expect(result).toBeDefined();
  });

  it('sets approvedBy and approvedAt on the sheet', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue({ ...baseSheet });
    const glService = { postJournalEntry: jest.fn(), findAccounts: jest.fn().mockResolvedValue({ items: [] }) };
    const grirService = { createGrEntry: jest.fn(async () => ({})) };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ repo, glService, grirService, dataSource: ds });

    await svc.approve('t1', 'ses-1', 'user-42');

    const savedSheet = manager.save.mock.calls[0][0];
    expect(savedSheet.approvedBy).toBe('user-42');
    expect(savedSheet.approvedAt).toBeInstanceOf(Date);
  });
});
