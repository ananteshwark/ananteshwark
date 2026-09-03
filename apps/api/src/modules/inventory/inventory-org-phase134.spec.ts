import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryOrgService } from './inventory-org.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { InventoryOrganization } from './entities/inventory-organization.entity';

const seqMock = () => ({
  next: jest.fn().mockResolvedValue(1),
  formatted: jest.fn((_t: string, _k: string, prefix: string, pad = 6) => Promise.resolve(`${prefix}${String(1).padStart(pad, '0')}`)),
});
import { ItemOrgAssignment } from './entities/item-org-assignment.entity';
import { InterOrgTransfer, InterOrgStatus } from './entities/inter-org-transfer.entity';
import { Item } from './entities/item.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('InventoryOrgService — Phase 134-136', () => {
  let service: InventoryOrgService;
  let orgRepo: any, assignRepo: any, transferRepo: any, itemRepo: any;

  beforeEach(async () => {
    orgRepo = mockRepo(); assignRepo = mockRepo(); transferRepo = mockRepo(); itemRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        InventoryOrgService,
        { provide: SequenceService, useValue: seqMock() },
        { provide: getRepositoryToken(InventoryOrganization), useValue: orgRepo },
        { provide: getRepositoryToken(ItemOrgAssignment), useValue: assignRepo },
        { provide: getRepositoryToken(InterOrgTransfer), useValue: transferRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
      ],
    }).compile();
    service = module.get(InventoryOrgService);
  });

  // ─── Ph-134: orgs ─────────────────────────────────────────────────

  it('createOrg — rejects duplicate code', async () => {
    orgRepo.findOne.mockResolvedValue({ id: 'o1' });
    await expect(service.createOrg('t1', { code: 'US1' })).rejects.toThrow(BadRequestException);
  });

  it('createOrg — happy path with defaults', async () => {
    orgRepo.findOne.mockResolvedValue(null);
    const o = await service.createOrg('t1', { code: 'US1', name: 'US East' });
    expect(orgRepo.create).toHaveBeenCalledWith(expect.objectContaining({ code: 'US1', costMethod: 'MOVING_AVERAGE', isActive: true }));
    expect(o.id).toBe('gen-1');
  });

  it('updateOrg — rejects self-parent', async () => {
    orgRepo.findOne.mockResolvedValue({ id: 'o1' });
    await expect(service.updateOrg('t1', 'o1', { parentOrgId: 'o1' })).rejects.toThrow(BadRequestException);
  });

  it('orgHierarchy — nests children under parents', async () => {
    orgRepo.find.mockResolvedValue([
      { id: 'root', code: 'GLOBAL', name: 'Global', parentOrgId: null },
      { id: 'c1', code: 'US', name: 'US', parentOrgId: 'root' },
      { id: 'c2', code: 'EU', name: 'EU', parentOrgId: 'root' },
    ]);
    const tree = await service.orgHierarchy('t1');
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
  });

  // ─── Ph-136: assignments ──────────────────────────────────────────

  it('assignItem — happy path', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'i1' });
    orgRepo.findOne.mockResolvedValue({ id: 'o1' });
    assignRepo.findOne.mockResolvedValue(null);
    const a = await service.assignItem('t1', { itemId: 'i1', organizationId: 'o1' });
    expect(assignRepo.create).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'i1', organizationId: 'o1', isActive: true }));
    expect(a.id).toBe('gen-1');
  });

  it('assignItem — rejects duplicate', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'i1' });
    orgRepo.findOne.mockResolvedValue({ id: 'o1' });
    assignRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.assignItem('t1', { itemId: 'i1', organizationId: 'o1' })).rejects.toThrow(BadRequestException);
  });

  it('assignItem — throws when item missing', async () => {
    itemRepo.findOne.mockResolvedValue(null);
    orgRepo.findOne.mockResolvedValue({ id: 'o1' });
    await expect(service.assignItem('t1', { itemId: 'nope', organizationId: 'o1' })).rejects.toThrow(NotFoundException);
  });

  it('isItemActiveInOrg — reflects assignment presence', async () => {
    assignRepo.findOne.mockResolvedValue({ id: 'a1' });
    expect(await service.isItemActiveInOrg('t1', 'i1', 'o1')).toBe(true);
    assignRepo.findOne.mockResolvedValue(null);
    expect(await service.isItemActiveInOrg('t1', 'i1', 'o2')).toBe(false);
  });

  // ─── Ph-135: inter-org transfers ──────────────────────────────────

  it('createTransfer — computes transfer price with markup + total', async () => {
    orgRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id }));
    itemRepo.findOne.mockResolvedValue({ id: 'i1', standardCost: 100 });
    assignRepo.findOne.mockResolvedValue({ id: 'a1' }); // active in both orgs
    transferRepo.count.mockResolvedValue(0);

    const t = await service.createTransfer('t1', {
      fromOrgId: 'o1', toOrgId: 'o2', itemId: 'i1', quantity: 10, unitCost: 100, markupPct: 15, freightAmount: 50, taxAmount: 20,
    });
    // transferPrice = 100 * 1.15 = 115; total = 115*10 + 50 + 20 = 1220
    expect(transferRepo.create).toHaveBeenCalledWith(expect.objectContaining({ transferPrice: 115, totalValue: 1220, transferNumber: 'IOT-000001' }));
    expect(t.id).toBe('gen-1');
  });

  it('createTransfer — rejects same source/dest org', async () => {
    await expect(service.createTransfer('t1', { fromOrgId: 'o1', toOrgId: 'o1', itemId: 'i1', quantity: 1 })).rejects.toThrow(BadRequestException);
  });

  it('createTransfer — rejects item not active in an org', async () => {
    orgRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id }));
    itemRepo.findOne.mockResolvedValue({ id: 'i1', standardCost: 100 });
    assignRepo.findOne.mockResolvedValue(null); // not active
    await expect(service.createTransfer('t1', { fromOrgId: 'o1', toOrgId: 'o2', itemId: 'i1', quantity: 5 })).rejects.toThrow(BadRequestException);
  });

  it('ship/receive — lifecycle transitions', async () => {
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', status: InterOrgStatus.DRAFT });
    transferRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    let t = await service.shipTransfer('t1', 'tr1');
    expect(t.status).toBe(InterOrgStatus.SHIPPED);
    expect(t.shippedAt).toBeInstanceOf(Date);
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', status: InterOrgStatus.SHIPPED });
    t = await service.receiveTransfer('t1', 'tr1');
    expect(t.status).toBe(InterOrgStatus.RECEIVED);
  });

  it('shipTransfer — rejects non-draft', async () => {
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', status: InterOrgStatus.SHIPPED });
    await expect(service.shipTransfer('t1', 'tr1')).rejects.toThrow(BadRequestException);
  });

  it('cancelTransfer — rejects received', async () => {
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', status: InterOrgStatus.RECEIVED });
    await expect(service.cancelTransfer('t1', 'tr1')).rejects.toThrow(BadRequestException);
  });
});
