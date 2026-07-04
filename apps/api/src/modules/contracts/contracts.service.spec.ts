import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractStatus } from './entities/contract.entity';
import { MilestoneStatus } from './entities/contract-milestone.entity';

/**
 * Contracts: numbering, DRAFT → ACTIVE → TERMINATED/RENEWED lifecycle,
 * renewal spawning a fresh ACTIVE contract that starts where the old one
 * ends, milestone completion, and template code uniqueness.
 */
describe('ContractsService', () => {
  let service: ContractsService;
  let contractRepo: any, milestoneRepo: any, templateRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'new-id', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 11 }),
    })),
  });

  beforeEach(() => {
    contractRepo = mockRepo(); milestoneRepo = mockRepo(); templateRepo = mockRepo();
    service = new ContractsService(contractRepo, milestoneRepo, templateRepo);
  });

  it('createContract numbers CTR-xxxxxx and records the owner', async () => {
    const c = await service.createContract('t1', { title: 'MSA' } as any, 'u1');
    expect(c.contractNumber).toBe('CTR-000012');
    expect(c.ownerId).toBe('u1');
  });

  it('activate requires DRAFT; terminate requires ACTIVE', async () => {
    contractRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ContractStatus.ACTIVE });
    await expect(service.activateContract('t1', 'c1')).rejects.toThrow(BadRequestException);

    contractRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ContractStatus.DRAFT });
    const active = await service.activateContract('t1', 'c1');
    expect(active.status).toBe(ContractStatus.ACTIVE);

    contractRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ContractStatus.DRAFT });
    await expect(service.terminateContract('t1', 'c1')).rejects.toThrow(BadRequestException);
  });

  it('renewContract spawns a fresh ACTIVE contract starting at the old end date', async () => {
    const original: any = {
      id: 'c1', tenantId: 't1', status: ContractStatus.ACTIVE, title: 'MSA',
      contractNumber: 'CTR-000001', endDate: '2026-12-31',
    };
    contractRepo.findOne.mockResolvedValue(original);
    const renewed = await service.renewContract('t1', 'c1', '2027-12-31');
    expect(renewed.contractNumber).toBe('CTR-000012'); // new number, not reused
    expect(renewed.startDate).toBe('2026-12-31');
    expect(renewed.endDate).toBe('2027-12-31');
    expect(renewed.status).toBe(ContractStatus.ACTIVE);
    expect(original.status).toBe(ContractStatus.RENEWED);
  });

  it('completeMilestone stamps completion date', async () => {
    milestoneRepo.findOne.mockResolvedValue({ id: 'm1', tenantId: 't1', status: MilestoneStatus.PENDING });
    const m = await service.completeMilestone('t1', 'm1');
    expect(m.status).toBe(MilestoneStatus.COMPLETED);
    expect(m.completedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('createMilestone verifies the contract exists in the tenant', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.createMilestone('t1', 'ghost', {} as any)).rejects.toThrow(NotFoundException);
  });

  it('createTemplate enforces unique code per tenant', async () => {
    templateRepo.findOne.mockResolvedValue({ id: 'tpl1' });
    await expect(service.createTemplate('t1', { code: 'NDA' } as any)).rejects.toThrow(ConflictException);
  });
});
