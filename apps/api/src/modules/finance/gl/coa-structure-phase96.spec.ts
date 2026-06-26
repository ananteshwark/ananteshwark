import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CoaStructureService } from './coa-structure.service';
import { CoaSegment, CoaSegmentValue } from './entities/coa-segment.entity';
import { AccountTree, AccountTreeNode } from './entities/account-tree.entity';
import { CrossValidationRule, SegmentOperator } from './entities/cross-validation-rule.entity';
import { Account } from './entities/account.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: 'gen-1', ...x })),
  remove: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
});

describe('CoaStructureService — Phase 96–98', () => {
  let service: CoaStructureService;
  let segmentRepo: ReturnType<typeof mockRepo>;
  let segValueRepo: ReturnType<typeof mockRepo>;
  let treeRepo: ReturnType<typeof mockRepo>;
  let nodeRepo: ReturnType<typeof mockRepo>;
  let cvrRepo: ReturnType<typeof mockRepo>;
  let accountRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    segmentRepo = mockRepo();
    segValueRepo = mockRepo();
    treeRepo = mockRepo();
    nodeRepo = mockRepo();
    cvrRepo = mockRepo();
    accountRepo = mockRepo();

    const module = await Test.createTestingModule({
      providers: [
        CoaStructureService,
        { provide: getRepositoryToken(CoaSegment), useValue: segmentRepo },
        { provide: getRepositoryToken(CoaSegmentValue), useValue: segValueRepo },
        { provide: getRepositoryToken(AccountTree), useValue: treeRepo },
        { provide: getRepositoryToken(AccountTreeNode), useValue: nodeRepo },
        { provide: getRepositoryToken(CrossValidationRule), useValue: cvrRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
      ],
    }).compile();

    service = module.get(CoaStructureService);
  });

  // ─── Ph-96: Segments ──────────────────────────────────────────────

  it('createSegment — happy path', async () => {
    segmentRepo.findOne.mockResolvedValue(null);
    const seg = await service.createSegment('t1', { position: 1, code: 'COMPANY', label: 'Company' });
    expect(segmentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ position: 1, code: 'COMPANY', delimiter: '-' }),
    );
    expect(seg.id).toBe('gen-1');
  });

  it('createSegment — rejects position out of range', async () => {
    await expect(
      service.createSegment('t1', { position: 9, code: 'X', label: 'X' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createSegment — rejects duplicate position', async () => {
    segmentRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createSegment('t1', { position: 1, code: 'X', label: 'X' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('parseAccountCode — splits by delimiter', async () => {
    segmentRepo.find.mockResolvedValue([{ position: 1, delimiter: '-' }]);
    const map = await service.parseAccountCode('t1', '01-200-4000-PROD');
    expect(map).toEqual({ 1: '01', 2: '200', 3: '4000', 4: 'PROD' });
  });

  it('validateAccountCode — no segments configured → no errors (flat codes)', async () => {
    segmentRepo.find.mockResolvedValue([]);
    const errors = await service.validateAccountCode('t1', 'whatever');
    expect(errors).toEqual([]);
  });

  it('validateAccountCode — flags missing required segment', async () => {
    segmentRepo.find.mockResolvedValue([
      { id: 's1', position: 1, label: 'Company', isRequired: true, isActive: true, delimiter: '-' },
      { id: 's2', position: 2, label: 'Account', isRequired: true, isActive: true, delimiter: '-' },
    ]);
    segValueRepo.find.mockResolvedValue([]);
    const errors = await service.validateAccountCode('t1', '01'); // only 1 part
    expect(errors.some((e) => e.includes('Segment 2'))).toBe(true);
  });

  it('validateAccountCode — flags value not in value set', async () => {
    segmentRepo.find.mockResolvedValue([
      { id: 's1', position: 1, label: 'Company', isRequired: true, isActive: true, delimiter: '-' },
    ]);
    segValueRepo.find.mockResolvedValue([{ value: '01' }, { value: '02' }]);
    const errors = await service.validateAccountCode('t1', '99');
    expect(errors.some((e) => e.includes('not a valid value'))).toBe(true);
  });

  it('validateAccountCode — passes when value is in value set', async () => {
    segmentRepo.find.mockResolvedValue([
      { id: 's1', position: 1, label: 'Company', isRequired: true, isActive: true, delimiter: '-' },
    ]);
    segValueRepo.find.mockResolvedValue([{ value: '01' }]);
    const errors = await service.validateAccountCode('t1', '01');
    expect(errors).toEqual([]);
  });

  it('createSegmentValue — validates parent segment exists', async () => {
    segmentRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createSegmentValue('t1', { segmentId: 'nope', value: '01', description: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-97: Trees ─────────────────────────────────────────────────

  it('createTree — rejects duplicate code', async () => {
    treeRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createTree('t1', { code: 'STAT', name: 'Statutory' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('addNode — rejects unknown tree', async () => {
    treeRepo.findOne.mockResolvedValue(null);
    await expect(
      service.addNode('t1', 'no-tree', { label: 'Root' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('addNode — happy path leaf node with account', async () => {
    treeRepo.findOne.mockResolvedValue({ id: 'tree-1' });
    accountRepo.findOne.mockResolvedValue({ id: 'acc-1' });
    const node = await service.addNode('t1', 'tree-1', { label: 'Cash', accountId: 'acc-1' });
    expect(nodeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ treeId: 'tree-1', accountId: 'acc-1' }),
    );
    expect(node.id).toBe('gen-1');
  });

  it('getTreeStructure — builds nested structure', async () => {
    treeRepo.findOne.mockResolvedValue({ id: 'tree-1', code: 'STAT' });
    nodeRepo.find.mockResolvedValue([
      { id: 'n1', parentNodeId: null, label: 'Assets', accountId: null, sortOrder: 0 },
      { id: 'n2', parentNodeId: 'n1', label: 'Cash', accountId: 'acc-cash', sortOrder: 0 },
      { id: 'n3', parentNodeId: 'n1', label: 'AR', accountId: 'acc-ar', sortOrder: 1 },
    ]);
    const result = await service.getTreeStructure('t1', 'tree-1');
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].label).toBe('Assets');
    expect(result.roots[0].isLeaf).toBe(false);
    expect(result.roots[0].children).toHaveLength(2);
    expect(result.roots[0].children[0].isLeaf).toBe(true);
  });

  it('deleteNode — re-parents children before removal', async () => {
    nodeRepo.findOne.mockResolvedValue({ id: 'n2', parentNodeId: 'n1' });
    await service.deleteNode('t1', 'n2');
    expect(nodeRepo.update).toHaveBeenCalledWith(
      { tenantId: 't1', parentNodeId: 'n2' },
      { parentNodeId: 'n1' },
    );
    expect(nodeRepo.remove).toHaveBeenCalled();
  });

  // ─── Ph-98: Cross-Validation Rules ────────────────────────────────

  describe('matchSegment', () => {
    it('eq', () => {
      expect(service.matchSegment(SegmentOperator.EQ, '01', '01')).toBe(true);
      expect(service.matchSegment(SegmentOperator.EQ, '01', '02')).toBe(false);
    });
    it('in', () => {
      expect(service.matchSegment(SegmentOperator.IN, '02', ['01', '02', '03'])).toBe(true);
      expect(service.matchSegment(SegmentOperator.IN, '09', ['01', '02'])).toBe(false);
    });
    it('startsWith', () => {
      expect(service.matchSegment(SegmentOperator.STARTS_WITH, '9100', '9')).toBe(true);
      expect(service.matchSegment(SegmentOperator.STARTS_WITH, '1100', '9')).toBe(false);
    });
    it('range', () => {
      expect(service.matchSegment(SegmentOperator.RANGE, '9500', { from: '9000', to: '9999' })).toBe(true);
      expect(service.matchSegment(SegmentOperator.RANGE, '4000', { from: '9000', to: '9999' })).toBe(false);
    });
    it('undefined actual → false', () => {
      expect(service.matchSegment(SegmentOperator.EQ, undefined, '01')).toBe(false);
    });
  });

  it('validateCombination — fires when both legs match (DISALLOW)', async () => {
    cvrRepo.find.mockResolvedValue([
      {
        id: 'r1', name: 'Co01 no 9xxx',
        conditionPosition: 1, conditionOperator: SegmentOperator.EQ, conditionValue: '01',
        targetPosition: 3, targetOperator: SegmentOperator.RANGE, targetValue: { from: '9000', to: '9999' },
        errorMessage: 'Company 01 cannot use 9xxx accounts',
      },
    ]);
    segmentRepo.find.mockResolvedValue([{ position: 1, delimiter: '-' }]);
    const violations = await service.validateCombination('t1', '01-200-9500-PROD');
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toBe('Company 01 cannot use 9xxx accounts');
  });

  it('validateCombination — no violation when condition does not match', async () => {
    cvrRepo.find.mockResolvedValue([
      {
        id: 'r1', name: 'Co01 no 9xxx',
        conditionPosition: 1, conditionOperator: SegmentOperator.EQ, conditionValue: '01',
        targetPosition: 3, targetOperator: SegmentOperator.RANGE, targetValue: { from: '9000', to: '9999' },
      },
    ]);
    segmentRepo.find.mockResolvedValue([{ position: 1, delimiter: '-' }]);
    const violations = await service.validateCombination('t1', '02-200-9500-PROD'); // company 02
    expect(violations).toHaveLength(0);
  });

  it('validateCombination — no rules → no violations', async () => {
    cvrRepo.find.mockResolvedValue([]);
    const violations = await service.validateCombination('t1', 'anything');
    expect(violations).toEqual([]);
  });

  it('assertAccountsValid — no-op when no active rules', async () => {
    cvrRepo.count.mockResolvedValue(0);
    await expect(service.assertAccountsValid('t1', ['acc-1'])).resolves.toBeUndefined();
    expect(accountRepo.find).not.toHaveBeenCalled();
  });

  it('assertAccountsValid — throws when a loaded account violates a rule', async () => {
    cvrRepo.count.mockResolvedValue(1);
    accountRepo.find.mockResolvedValue([{ id: 'acc-1', code: '01-200-9500-PROD' }]);
    cvrRepo.find.mockResolvedValue([
      {
        id: 'r1', name: 'Co01 no 9xxx',
        conditionPosition: 1, conditionOperator: SegmentOperator.EQ, conditionValue: '01',
        targetPosition: 3, targetOperator: SegmentOperator.RANGE, targetValue: { from: '9000', to: '9999' },
        errorMessage: 'blocked',
      },
    ]);
    segmentRepo.find.mockResolvedValue([{ position: 1, delimiter: '-' }]);
    await expect(service.assertAccountsValid('t1', ['acc-1'])).rejects.toThrow(BadRequestException);
  });

  it('assertAccountsValid — passes when accounts are valid', async () => {
    cvrRepo.count.mockResolvedValue(1);
    accountRepo.find.mockResolvedValue([{ id: 'acc-1', code: '02-200-4000-PROD' }]);
    cvrRepo.find.mockResolvedValue([
      {
        id: 'r1', name: 'Co01 no 9xxx',
        conditionPosition: 1, conditionOperator: SegmentOperator.EQ, conditionValue: '01',
        targetPosition: 3, targetOperator: SegmentOperator.RANGE, targetValue: { from: '9000', to: '9999' },
      },
    ]);
    segmentRepo.find.mockResolvedValue([{ position: 1, delimiter: '-' }]);
    await expect(service.assertAccountsValid('t1', ['acc-1'])).resolves.toBeUndefined();
  });
});
