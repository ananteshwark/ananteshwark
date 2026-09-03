import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { EmployeeStatus } from './entities/employee.entity';
import { TransferStatus } from './entities/employee-transfer.entity';

/**
 * Employee master: uniqueness guards, optional login-account provisioning with
 * Employee-role grant, bulk-create error collection, exit transitions, the
 * recursive reportee walk, transfer approve → effectuate, org-tree assembly
 * with orphan surfacing, and org-level config seeding.
 */
describe('EmployeeService', () => {
  let service: EmployeeService;
  let employeeRepo: any, departmentRepo: any, businessUnitRepo: any, legalEntityRepo: any,
    divisionRepo: any, functionRepo: any, subFunctionRepo: any, teamRepo: any,
    designationRepo: any, locationRepo: any, documentRepo: any, transferRepo: any,
    orgLevelConfigRepo: any, usersService: any, rbacService: any, permissionsService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    upsert: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    employeeRepo = mockRepo(); departmentRepo = mockRepo(); businessUnitRepo = mockRepo();
    legalEntityRepo = mockRepo(); divisionRepo = mockRepo(); functionRepo = mockRepo();
    subFunctionRepo = mockRepo(); teamRepo = mockRepo(); designationRepo = mockRepo();
    locationRepo = mockRepo(); documentRepo = mockRepo(); transferRepo = mockRepo();
    orgLevelConfigRepo = mockRepo();
    usersService = { create: jest.fn().mockResolvedValue({ id: 'user-1' }) };
    rbacService = { findAll: jest.fn().mockResolvedValue([{ id: 'role-emp', name: 'Employee' }]) };
    permissionsService = { assignRole: jest.fn().mockResolvedValue(undefined) };
    service = new EmployeeService(
      employeeRepo, departmentRepo, businessUnitRepo, legalEntityRepo, divisionRepo,
      functionRepo, subFunctionRepo, teamRepo, designationRepo, locationRepo,
      documentRepo, transferRepo, orgLevelConfigRepo,
      usersService, rbacService, permissionsService,
    );
  });

  const dto = (over: any = {}) => ({
    employeeCode: 'EMP-1', email: 'a@x.com', firstName: 'Ada', lastName: 'L', ...over,
  });

  // ─── Create ─────────────────────────────────────────────────────

  it('rejects duplicate employee code and duplicate email', async () => {
    employeeRepo.findOne.mockResolvedValueOnce({ id: 'e0' }); // code taken
    await expect(service.createEmployee('t1', dto() as any)).rejects.toThrow(ConflictException);

    employeeRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'e0' }); // email taken
    await expect(service.createEmployee('t1', dto() as any)).rejects.toThrow(ConflictException);
  });

  it('provisions a login account and grants the Employee role when requested', async () => {
    await service.createEmployee('t1', dto({ createLoginAccount: true, loginPassword: 'password123' }) as any);
    expect(usersService.create).toHaveBeenCalledWith('t1', expect.objectContaining({ email: 'a@x.com' }));
    expect(permissionsService.assignRole).toHaveBeenCalledWith('user-1', 'role-emp', 't1', 'user-1');
    // login credentials must not be persisted onto the employee row
    expect(employeeRepo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ loginPassword: expect.anything() }),
    );
  });

  it('creates without a user account when not requested', async () => {
    await service.createEmployee('t1', dto() as any);
    expect(usersService.create).not.toHaveBeenCalled();
    expect(permissionsService.assignRole).not.toHaveBeenCalled();
  });

  it('bulkCreateEmployees collects per-row errors and keeps going', async () => {
    // row 1 ok; row 2 duplicate code; row 3 ok
    employeeRepo.findOne
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null) // row1 code+email free
      .mockResolvedValueOnce({ id: 'dupe' })                    // row2 code taken
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null); // row3 free
    const r = await service.bulkCreateEmployees('t1', [
      dto({ employeeCode: 'E1', email: '1@x.com' }),
      dto({ employeeCode: 'E1', email: '2@x.com' }),
      dto({ employeeCode: 'E3', email: '3@x.com' }),
    ] as any);
    expect(r.created).toBe(2);
    expect(r.errors).toEqual([{ row: 2, error: expect.stringContaining('already exists') }]);
  });

  // ─── Exits ──────────────────────────────────────────────────────

  it('terminate and resign set status + dateOfLeaving', async () => {
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', status: EmployeeStatus.ACTIVE });
    const t = await service.terminateEmployee('t1', 'e1', '2026-07-31');
    expect(t.status).toBe(EmployeeStatus.TERMINATED);
    expect(t.dateOfLeaving).toBe('2026-07-31');

    employeeRepo.findOne.mockResolvedValue({ id: 'e2', tenantId: 't1', status: EmployeeStatus.ACTIVE });
    const r = await service.resignEmployee('t1', 'e2', '2026-08-15');
    expect(r.status).toBe(EmployeeStatus.RESIGNED);
  });

  // ─── Reportees ──────────────────────────────────────────────────

  it('getReportees walks the hierarchy recursively', async () => {
    employeeRepo.find.mockImplementation(({ where }: any) => {
      if (where.managerId === 'boss') return Promise.resolve([{ id: 'm1' }, { id: 'm2' }]);
      if (where.managerId === 'm1') return Promise.resolve([{ id: 'ic1' }]);
      return Promise.resolve([]);
    });
    const all = await service.getReportees('t1', 'boss');
    expect(all.map((e: any) => e.id).sort()).toEqual(['ic1', 'm1', 'm2']);
  });

  // ─── Transfers ──────────────────────────────────────────────────

  it('effectuateTransfer requires APPROVED and applies the org change', async () => {
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', tenantId: 't1', status: TransferStatus.PENDING });
    await expect(service.effectuateTransfer('t1', 'tr1')).rejects.toThrow(BadRequestException);

    transferRepo.findOne.mockResolvedValue({
      id: 'tr1', tenantId: 't1', status: TransferStatus.APPROVED,
      employeeId: 'e1', toDepartmentId: 'd2', toDesignationId: 'des2',
    });
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', departmentId: 'd1', designationId: 'des1' });
    const tr = await service.effectuateTransfer('t1', 'tr1');
    expect(tr.status).toBe(TransferStatus.EFFECTIVE);
    expect(employeeRepo.save).toHaveBeenCalledWith(expect.objectContaining({ departmentId: 'd2', designationId: 'des2' }));
  });

  it('approveTransfer stamps approver and time', async () => {
    transferRepo.findOne.mockResolvedValue({ id: 'tr1', tenantId: 't1', status: TransferStatus.PENDING });
    const tr = await service.approveTransfer('t1', 'tr1', 'boss');
    expect(tr.status).toBe(TransferStatus.APPROVED);
    expect(tr.approvedById).toBe('boss');
    expect(tr.approvedAt).toBeInstanceOf(Date);
  });

  // ─── Org tree ───────────────────────────────────────────────────

  it('getOrgTree nests LE > BU > Division > Department and surfaces orphans', async () => {
    legalEntityRepo.find.mockResolvedValue([{ id: 'le1', name: 'HoldCo' }]);
    businessUnitRepo.find.mockResolvedValue([{ id: 'bu1', legalEntityId: 'le1' }]);
    divisionRepo.find.mockResolvedValue([{ id: 'dv1', businessUnitId: 'bu1' }]);
    departmentRepo.find.mockResolvedValue([
      { id: 'd1', divisionId: 'dv1' },            // attached
      { id: 'd-orphan', divisionId: null, businessUnitId: null }, // orphan
    ]);
    const tree = await service.getOrgTree('t1');
    const holdco = tree.find((n: any) => n.id === 'le1');
    expect(holdco.children[0].id).toBe('bu1');
    expect(holdco.children[0].children[0].id).toBe('dv1');
    expect(holdco.children[0].children[0].children[0].id).toBe('d1');

    const unassigned = tree.find((n: any) => n.id === '__unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned.children.some((c: any) => c.id === 'd-orphan')).toBe(true);
  });

  // ─── Org level config ───────────────────────────────────────────

  it('getOrgLevelConfig seeds the 7 default levels on first read', async () => {
    orgLevelConfigRepo.find
      .mockResolvedValueOnce([])   // nothing yet
      .mockResolvedValueOnce([{ level: 'x' }]); // re-read after seed
    await service.getOrgLevelConfig('t1');
    const seeded = orgLevelConfigRepo.save.mock.calls[0][0];
    expect(seeded).toHaveLength(7);
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.findEmployee('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(employeeRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'x' } });
  });
});
