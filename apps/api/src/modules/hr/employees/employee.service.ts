import { Injectable, NotFoundException, ConflictException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { BusinessUnit } from './entities/business-unit.entity';
import { LegalEntity } from './entities/legal-entity.entity';
import { Division } from './entities/division.entity';
import { OrgFunction } from './entities/org-function.entity';
import { SubFunction } from './entities/sub-function.entity';
import { Team } from './entities/team.entity';
import { Designation } from './entities/designation.entity';
import { Location } from './entities/location.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeTransfer, TransferStatus } from './entities/employee-transfer.entity';
import { OrgLevelConfig, OrgLevel } from './entities/org-level-config.entity';
import {
  CreateEmployeeDto, UpdateEmployeeDto,
  CreateLegalEntityDto, UpdateLegalEntityDto,
  CreateBusinessUnitDto, UpdateBusinessUnitDto,
  CreateDivisionDto, UpdateDivisionDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  CreateFunctionDto, UpdateFunctionDto,
  CreateSubFunctionDto, UpdateSubFunctionDto,
  CreateTeamDto, UpdateTeamDto,
  CreateDesignationDto, UpdateDesignationDto,
  CreateLocationDto, UpdateLocationDto,
  OrgLevelConfigItemDto,
} from './dto/employee.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { PermissionsService } from '../../rbac/permissions.service';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepo: Repository<BusinessUnit>,
    @InjectRepository(LegalEntity)
    private readonly legalEntityRepo: Repository<LegalEntity>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(OrgFunction)
    private readonly functionRepo: Repository<OrgFunction>,
    @InjectRepository(SubFunction)
    private readonly subFunctionRepo: Repository<SubFunction>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Designation)
    private readonly designationRepo: Repository<Designation>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(EmployeeDocument)
    private readonly documentRepo: Repository<EmployeeDocument>,
    @InjectRepository(EmployeeTransfer)
    private readonly transferRepo: Repository<EmployeeTransfer>,
    @InjectRepository(OrgLevelConfig)
    private readonly orgLevelConfigRepo: Repository<OrgLevelConfig>,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly permissionsService: PermissionsService,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ---- Employees ----
  async createEmployee(tenantId: string, dto: CreateEmployeeDto): Promise<Employee> {
    const existing = await this.employeeRepo.findOne({ where: { tenantId, employeeCode: dto.employeeCode } });
    if (existing) throw new ConflictException(`Employee code ${dto.employeeCode} already exists`);
    const existingEmail = await this.employeeRepo.findOne({ where: { tenantId, email: dto.email } });
    if (existingEmail) throw new ConflictException(`Email ${dto.email} already exists`);

    // Optionally create a login account for the employee.
    let userId = dto.userId ?? null;
    if (dto.createLoginAccount && dto.loginPassword) {
      const user = await this.usersService.create(tenantId, {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.loginPassword,
      } as any);
      userId = user.id;
    }

    const { createLoginAccount, loginPassword, ...rest } = dto;
    const employee = this.employeeRepo.create({ ...rest, tenantId, userId, status: dto.status ?? EmployeeStatus.ACTIVE });
    const saved = await this.employeeRepo.save(employee);

    // Auto-assign the Employee role to the linked user account.
    if (userId) {
      const roles = await this.rbacService.findAll(tenantId);
      const employeeRole = roles.find((r: any) => r.name === 'Employee');
      if (employeeRole) {
        await this.permissionsService.assignRole(userId, employeeRole.id, tenantId, userId);
      }
    }

    await this.automation?.emit(tenantId, 'employee.created', { employeeId: saved.id, employeeCode: saved.employeeCode, email: saved.email, departmentId: saved.departmentId ?? null });
    return saved;
  }

  async bulkCreateEmployees(tenantId: string, rows: CreateEmployeeDto[]): Promise<{ created: number; errors: { row: number; error: string }[] }> {
    const errors: { row: number; error: string }[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.createEmployee(tenantId, rows[i]);
        created++;
      } catch (e: any) {
        errors.push({ row: i + 1, error: e.message ?? String(e) });
      }
    }
    return { created, errors };
  }

  async findEmployees(tenantId: string, pagination: PaginationDto, filters?: { search?: string; departmentId?: string; status?: string }): Promise<PaginatedResponseDto<Employee>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = pagination;
    const qb = this.employeeRepo.createQueryBuilder('e').where('e.tenantId = :tenantId', { tenantId });
    if (filters?.search) {
      qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.email ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${filters.search}%` });
    }
    if (filters?.departmentId) qb.andWhere('e.departmentId = :deptId', { deptId: filters.departmentId });
    if (filters?.status) qb.andWhere('e.status = :status', { status: filters.status });
    qb.orderBy(`e.${sortBy}`, sortOrder as 'ASC' | 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findEmployee(tenantId: string, id: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({ where: { tenantId, id } });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async updateEmployee(tenantId: string, id: string, dto: UpdateEmployeeDto): Promise<Employee> {
    const employee = await this.findEmployee(tenantId, id);
    Object.assign(employee, dto);
    return this.employeeRepo.save(employee);
  }

  async terminateEmployee(tenantId: string, id: string, dateOfLeaving: string): Promise<Employee> {
    const employee = await this.findEmployee(tenantId, id);
    employee.status = EmployeeStatus.TERMINATED;
    employee.dateOfLeaving = dateOfLeaving;
    const saved = await this.employeeRepo.save(employee);
    await this.automation?.emit(tenantId, 'employee.terminated', { employeeId: saved.id, employeeCode: saved.employeeCode, dateOfLeaving, reason: 'TERMINATED' });
    return saved;
  }

  async resignEmployee(tenantId: string, id: string, dateOfLeaving: string): Promise<Employee> {
    const employee = await this.findEmployee(tenantId, id);
    employee.status = EmployeeStatus.RESIGNED;
    employee.dateOfLeaving = dateOfLeaving;
    const saved = await this.employeeRepo.save(employee);
    await this.automation?.emit(tenantId, 'employee.terminated', { employeeId: saved.id, employeeCode: saved.employeeCode, dateOfLeaving, reason: 'RESIGNED' });
    return saved;
  }

  async getReportees(tenantId: string, employeeId: string): Promise<Employee[]> {
    const direct = await this.employeeRepo.find({ where: { tenantId, managerId: employeeId } });
    const all: Employee[] = [...direct];
    for (const d of direct) {
      const indirect = await this.getReportees(tenantId, d.id);
      all.push(...indirect);
    }
    return all;
  }

  // ---- Departments ----
  async createDepartment(tenantId: string, dto: CreateDepartmentDto): Promise<Department> {
    const existing = await this.departmentRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Department code ${dto.code} already exists`);
    const dept = this.departmentRepo.create({ ...dto, tenantId });
    return this.departmentRepo.save(dept);
  }

  async findDepartments(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Department>> {
    const { page = 1, limit = 50 } = pagination;
    const [items, total] = await this.departmentRepo.findAndCount({ where: { tenantId }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findDepartment(tenantId: string, id: string): Promise<Department> {
    const dept = await this.departmentRepo.findOne({ where: { tenantId, id } });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return dept;
  }

  async updateDepartment(tenantId: string, id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const dept = await this.findDepartment(tenantId, id);
    Object.assign(dept, dto);
    return this.departmentRepo.save(dept);
  }

  // ---- Legal Entities ----
  async createLegalEntity(tenantId: string, dto: CreateLegalEntityDto): Promise<LegalEntity> {
    const existing = await this.legalEntityRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Legal entity code ${dto.code} already exists`);
    return this.legalEntityRepo.save(this.legalEntityRepo.create({ ...dto, tenantId }));
  }

  async findLegalEntities(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<LegalEntity>> {
    const { page = 1, limit = 100 } = pagination;
    const [items, total] = await this.legalEntityRepo.findAndCount({ where: { tenantId }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateLegalEntity(tenantId: string, id: string, dto: UpdateLegalEntityDto): Promise<LegalEntity> {
    const le = await this.legalEntityRepo.findOne({ where: { tenantId, id } });
    if (!le) throw new NotFoundException(`Legal entity ${id} not found`);
    Object.assign(le, dto);
    return this.legalEntityRepo.save(le);
  }

  // ---- Divisions ----
  async createDivision(tenantId: string, dto: CreateDivisionDto): Promise<Division> {
    const existing = await this.divisionRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Division code ${dto.code} already exists`);
    return this.divisionRepo.save(this.divisionRepo.create({ ...dto, tenantId }));
  }

  async findDivisions(tenantId: string, pagination: PaginationDto, businessUnitId?: string): Promise<PaginatedResponseDto<Division>> {
    const { page = 1, limit = 100 } = pagination;
    const where: any = { tenantId };
    if (businessUnitId) where.businessUnitId = businessUnitId;
    const [items, total] = await this.divisionRepo.findAndCount({ where, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateDivision(tenantId: string, id: string, dto: UpdateDivisionDto): Promise<Division> {
    const div = await this.divisionRepo.findOne({ where: { tenantId, id } });
    if (!div) throw new NotFoundException(`Division ${id} not found`);
    Object.assign(div, dto);
    return this.divisionRepo.save(div);
  }

  // ---- Business Units ----
  async createBusinessUnit(tenantId: string, dto: CreateBusinessUnitDto): Promise<BusinessUnit> {
    const existing = await this.businessUnitRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Business unit code ${dto.code} already exists`);
    return this.businessUnitRepo.save(this.businessUnitRepo.create({ ...dto, tenantId }));
  }

  async findBusinessUnits(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<BusinessUnit>> {
    const { page = 1, limit = 100 } = pagination;
    const [items, total] = await this.businessUnitRepo.findAndCount({ where: { tenantId }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateBusinessUnit(tenantId: string, id: string, dto: UpdateBusinessUnitDto): Promise<BusinessUnit> {
    const bu = await this.businessUnitRepo.findOne({ where: { tenantId, id } });
    if (!bu) throw new NotFoundException(`Business unit ${id} not found`);
    Object.assign(bu, dto);
    return this.businessUnitRepo.save(bu);
  }

  // ---- Functions ----
  async createFunction(tenantId: string, dto: CreateFunctionDto): Promise<OrgFunction> {
    const existing = await this.functionRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Function code ${dto.code} already exists`);
    return this.functionRepo.save(this.functionRepo.create({ ...dto, tenantId }));
  }

  async findFunctions(tenantId: string, pagination: PaginationDto, departmentId?: string): Promise<PaginatedResponseDto<OrgFunction>> {
    const { page = 1, limit = 100 } = pagination;
    const where: any = { tenantId };
    if (departmentId) where.departmentId = departmentId;
    const [items, total] = await this.functionRepo.findAndCount({ where, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateFunction(tenantId: string, id: string, dto: UpdateFunctionDto): Promise<OrgFunction> {
    const fn = await this.functionRepo.findOne({ where: { tenantId, id } });
    if (!fn) throw new NotFoundException(`Function ${id} not found`);
    Object.assign(fn, dto);
    return this.functionRepo.save(fn);
  }

  // ---- Sub Functions ----
  async createSubFunction(tenantId: string, dto: CreateSubFunctionDto): Promise<SubFunction> {
    const existing = await this.subFunctionRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Sub function code ${dto.code} already exists`);
    return this.subFunctionRepo.save(this.subFunctionRepo.create({ ...dto, tenantId }));
  }

  async findSubFunctions(tenantId: string, pagination: PaginationDto, functionId?: string): Promise<PaginatedResponseDto<SubFunction>> {
    const { page = 1, limit = 100 } = pagination;
    const where: any = { tenantId };
    if (functionId) where.functionId = functionId;
    const [items, total] = await this.subFunctionRepo.findAndCount({ where, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateSubFunction(tenantId: string, id: string, dto: UpdateSubFunctionDto): Promise<SubFunction> {
    const sf = await this.subFunctionRepo.findOne({ where: { tenantId, id } });
    if (!sf) throw new NotFoundException(`Sub function ${id} not found`);
    Object.assign(sf, dto);
    return this.subFunctionRepo.save(sf);
  }

  // ---- Teams ----
  async createTeam(tenantId: string, dto: CreateTeamDto): Promise<Team> {
    const existing = await this.teamRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Team code ${dto.code} already exists`);
    return this.teamRepo.save(this.teamRepo.create({ ...dto, tenantId }));
  }

  async findTeams(tenantId: string, pagination: PaginationDto, subFunctionId?: string): Promise<PaginatedResponseDto<Team>> {
    const { page = 1, limit = 100 } = pagination;
    const where: any = { tenantId };
    if (subFunctionId) where.subFunctionId = subFunctionId;
    const [items, total] = await this.teamRepo.findAndCount({ where, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateTeam(tenantId: string, id: string, dto: UpdateTeamDto): Promise<Team> {
    const team = await this.teamRepo.findOne({ where: { tenantId, id } });
    if (!team) throw new NotFoundException(`Team ${id} not found`);
    Object.assign(team, dto);
    return this.teamRepo.save(team);
  }

  // Full org hierarchy:
  // Legal Entity > Business Unit > Division > Department (self-nesting) > Function > Sub Function > Team.
  // Orphans at any level are surfaced under a synthetic "Unassigned" node of the
  // appropriate parent level so nothing is ever hidden from the tree.
  async getOrgTree(tenantId: string): Promise<any[]> {
    const [les, bus, divs, depts, fns, subs, teams] = await Promise.all([
      this.legalEntityRepo.find({ where: { tenantId } }),
      this.businessUnitRepo.find({ where: { tenantId } }),
      this.divisionRepo.find({ where: { tenantId } }),
      this.departmentRepo.find({ where: { tenantId } }),
      this.functionRepo.find({ where: { tenantId } }),
      this.subFunctionRepo.find({ where: { tenantId } }),
      this.teamRepo.find({ where: { tenantId } }),
    ]);

    const groupBy = <T>(rows: T[], keyFn: (r: T) => string | null | undefined) => {
      const map = new Map<string, T[]>();
      for (const r of rows) {
        const key = keyFn(r) ?? '__none__';
        const arr = map.get(key) ?? [];
        arr.push(r);
        map.set(key, arr);
      }
      return map;
    };

    // Teams grouped under their sub function.
    const teamsBySub = groupBy(teams, t => t.subFunctionId);
    // Sub functions grouped under their function, carrying team children.
    const subsByFn = groupBy(subs, s => s.functionId);
    // Functions grouped under their department, carrying sub-function children.
    const fnsByDept = groupBy(fns, f => f.departmentId);

    const buildSub = (s: any) => ({ ...s, level: 'subFunction', children: (teamsBySub.get(s.id) ?? []).map(t => ({ ...t, level: 'team' })) });
    const buildFn = (f: any) => ({ ...f, level: 'function', children: (subsByFn.get(f.id) ?? []).map(buildSub) });

    // Departments self-nest via parentId. Build each department's children as
    // its functions plus any child departments, recursively.
    const deptsByParent = groupBy(depts.filter(d => d.parentId), d => d.parentId);
    const buildDept = (d: any): any => ({
      ...d,
      level: 'department',
      children: [
        ...(deptsByParent.get(d.id) ?? []).map(buildDept),
        ...(fnsByDept.get(d.id) ?? []).map(buildFn),
      ],
    });

    // Root departments (no parent) attach to their division, else business unit.
    const rootDepts = depts.filter(d => !d.parentId);
    const rootDeptsByDiv = groupBy(rootDepts.filter(d => d.divisionId), d => d.divisionId);
    const rootDeptsByBu = groupBy(rootDepts.filter(d => !d.divisionId), d => d.businessUnitId);

    const buildDiv = (v: any) => ({ ...v, level: 'division', children: (rootDeptsByDiv.get(v.id) ?? []).map(buildDept) });
    const divsByBu = groupBy(divs, v => v.businessUnitId);

    const buildBu = (b: any) => ({
      ...b,
      level: 'businessUnit',
      children: [
        ...(divsByBu.get(b.id) ?? []).map(buildDiv),
        ...(rootDeptsByBu.get(b.id) ?? []).map(buildDept),
      ],
    });
    const busByLe = groupBy(bus, b => b.legalEntityId);

    const roots: any[] = les.map(le => ({ ...le, level: 'legalEntity', children: (busByLe.get(le.id) ?? []).map(buildBu) }));

    // Surface orphans so nothing is hidden.
    const orphanBus = (busByLe.get('__none__') ?? []).map(buildBu);
    const orphanDivs = (divsByBu.get('__none__') ?? []).map(buildDiv);
    const orphanRootDeptsByBu = (rootDeptsByBu.get('__none__') ?? []).map(buildDept);
    const orphanRootDeptsByDiv = (rootDeptsByDiv.get('__none__') ?? []).map(buildDept);
    const orphanFns = (fnsByDept.get('__none__') ?? []).map(buildFn);
    const orphanSubs = (subsByFn.get('__none__') ?? []).map(buildSub);
    const orphanTeams = (teamsBySub.get('__none__') ?? []).map((t: any) => ({ ...t, level: 'team' }));

    const orphans = [
      ...orphanBus, ...orphanDivs, ...orphanRootDeptsByBu, ...orphanRootDeptsByDiv,
      ...orphanFns, ...orphanSubs, ...orphanTeams,
    ];
    if (orphans.length) {
      roots.push({ id: '__unassigned__', code: 'UNASSIGNED', name: 'Unassigned', level: 'legalEntity', isActive: true, children: orphans } as any);
    }
    return roots;
  }

  // ---- Designations ----
  async createDesignation(tenantId: string, dto: CreateDesignationDto): Promise<Designation> {
    const existing = await this.designationRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Designation code ${dto.code} already exists`);
    const desig = this.designationRepo.create({ ...dto, tenantId });
    return this.designationRepo.save(desig);
  }

  async findDesignations(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Designation>> {
    const { page = 1, limit = 50 } = pagination;
    const [items, total] = await this.designationRepo.findAndCount({ where: { tenantId }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findDesignation(tenantId: string, id: string): Promise<Designation> {
    const desig = await this.designationRepo.findOne({ where: { tenantId, id } });
    if (!desig) throw new NotFoundException(`Designation ${id} not found`);
    return desig;
  }

  async updateDesignation(tenantId: string, id: string, dto: UpdateDesignationDto): Promise<Designation> {
    const desig = await this.findDesignation(tenantId, id);
    Object.assign(desig, dto);
    return this.designationRepo.save(desig);
  }

  // ---- Locations ----
  async createLocation(tenantId: string, dto: CreateLocationDto): Promise<Location> {
    const existing = await this.locationRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Location code ${dto.code} already exists`);
    const loc = this.locationRepo.create({ ...dto, tenantId });
    return this.locationRepo.save(loc);
  }

  async findLocations(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Location>> {
    const { page = 1, limit = 50 } = pagination;
    const [items, total] = await this.locationRepo.findAndCount({ where: { tenantId }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findLocation(tenantId: string, id: string): Promise<Location> {
    const loc = await this.locationRepo.findOne({ where: { tenantId, id } });
    if (!loc) throw new NotFoundException(`Location ${id} not found`);
    return loc;
  }

  async updateLocation(tenantId: string, id: string, dto: UpdateLocationDto): Promise<Location> {
    const loc = await this.findLocation(tenantId, id);
    Object.assign(loc, dto);
    return this.locationRepo.save(loc);
  }

  // ---- Transfers & Promotions ----

  async listTransfers(tenantId: string, employeeId?: string): Promise<EmployeeTransfer[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.transferRepo.find({ where, order: { effectiveDate: 'DESC' } });
  }

  async createTransfer(tenantId: string, dto: Partial<EmployeeTransfer>): Promise<EmployeeTransfer> {
    const transfer = this.transferRepo.create({ ...dto, tenantId });
    return this.transferRepo.save(transfer);
  }

  async approveTransfer(tenantId: string, id: string, approvedById: string): Promise<EmployeeTransfer> {
    const transfer = await this.transferRepo.findOne({ where: { id, tenantId } });
    if (!transfer) throw new NotFoundException(`Transfer ${id} not found`);
    transfer.status = TransferStatus.APPROVED;
    transfer.approvedById = approvedById;
    transfer.approvedAt = new Date();
    return this.transferRepo.save(transfer);
  }

  async effectuateTransfer(tenantId: string, id: string): Promise<EmployeeTransfer> {
    const transfer = await this.transferRepo.findOne({ where: { id, tenantId } });
    if (!transfer) throw new NotFoundException(`Transfer ${id} not found`);
    if (transfer.status !== TransferStatus.APPROVED) {
      throw new BadRequestException('Transfer must be approved before being effectuated');
    }
    const employee = await this.findEmployee(tenantId, transfer.employeeId);
    if (transfer.toDepartmentId) employee.departmentId = transfer.toDepartmentId;
    if (transfer.toDesignationId) employee.designationId = transfer.toDesignationId;
    await this.employeeRepo.save(employee);
    transfer.status = TransferStatus.EFFECTIVE;
    return this.transferRepo.save(transfer);
  }

  // ---- Org Level Config ----

  private readonly DEFAULT_CONFIGS: { level: OrgLevel; enabled: boolean; required: boolean }[] = [
    { level: OrgLevel.LEGAL_ENTITY, enabled: true, required: false },
    { level: OrgLevel.BUSINESS_UNIT, enabled: true, required: true },
    { level: OrgLevel.DIVISION, enabled: true, required: false },
    { level: OrgLevel.DEPARTMENT, enabled: true, required: true },
    { level: OrgLevel.FUNCTION, enabled: true, required: true },
    { level: OrgLevel.SUB_FUNCTION, enabled: true, required: false },
    { level: OrgLevel.TEAM, enabled: true, required: false },
  ];

  async getOrgLevelConfig(tenantId: string): Promise<OrgLevelConfig[]> {
    const existing = await this.orgLevelConfigRepo.find({ where: { tenantId } });
    const existingLevels = new Set(existing.map(c => c.level));
    const missing = this.DEFAULT_CONFIGS.filter(d => !existingLevels.has(d.level));
    if (missing.length) {
      const records = missing.map(d => this.orgLevelConfigRepo.create({ tenantId, ...d }));
      await this.orgLevelConfigRepo.save(records);
      return this.orgLevelConfigRepo.find({ where: { tenantId }, order: { level: 'ASC' } });
    }
    return existing;
  }

  async updateOrgLevelConfig(tenantId: string, configs: OrgLevelConfigItemDto[]): Promise<OrgLevelConfig[]> {
    for (const item of configs) {
      await this.orgLevelConfigRepo.upsert(
        { tenantId, level: item.level, enabled: item.enabled, required: item.required },
        { conflictPaths: ['tenantId', 'level'] },
      );
    }
    return this.getOrgLevelConfig(tenantId);
  }
}
