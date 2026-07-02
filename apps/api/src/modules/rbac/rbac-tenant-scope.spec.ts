import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { Role } from './entities/role.entity';

const mockRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
  delete: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
});

describe('RbacService — tenant scoping & system-role protection (C2)', () => {
  let service: RbacService;
  let roleRepo: any;

  beforeEach(async () => {
    roleRepo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
      ],
    }).compile();
    service = moduleRef.get(RbacService);
  });

  it('findById is tenant-scoped (cannot read another tenant\'s role)', async () => {
    roleRepo.findOne.mockResolvedValue(null);
    await expect(service.findById('r1', 'tenantA')).rejects.toBeInstanceOf(NotFoundException);
    expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', tenantId: 'tenantA' } });
  });

  it('update refuses to modify a system role', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystemRole: true, name: 'Tenant Admin' });
    await expect(service.update('r1', 't1', { name: 'x' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(roleRepo.save).not.toHaveBeenCalled();
  });

  it('update saves a tenant-owned custom role', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystemRole: false, name: 'Custom' });
    await service.update('r1', 't1', { name: 'Renamed' } as any);
    expect(roleRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
  });

  it('delete refuses to remove a system role', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystemRole: true });
    await expect(service.delete('r1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(roleRepo.delete).not.toHaveBeenCalled();
  });

  it('delete removes a tenant-owned custom role scoped by tenant', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystemRole: false });
    await service.delete('r1', 't1');
    expect(roleRepo.delete).toHaveBeenCalledWith({ id: 'r1', tenantId: 't1' });
  });

  it('findAll filters strictly by tenantId (no cross-tenant system-role leak)', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    roleRepo.createQueryBuilder.mockReturnValue(qb);
    await service.findAll('t1');
    expect(qb.where).toHaveBeenCalledWith('role.tenantId = :tenantId', { tenantId: 't1' });
  });
});
