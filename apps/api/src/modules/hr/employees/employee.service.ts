import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { BusinessUnit } from './entities/business-unit.entity';
import { OrgFunction } from './entities/org-function.entity';
import { SubFunction } from './entities/sub-function.entity';
import { Designation } from './entities/designation.entity';
import { Location } from './entities/location.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeTransfer, TransferStatus } from './entities/employee-transfer.entity';
import {
  CreateEmployeeDto, UpdateEmployeeDto,
  CreateBusinessUnitDto, UpdateBusinessUnitDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  CreateFunctionDto, UpdateFunctionDto,
  CreateSubFunctionDto, UpdateSubFunctionDto,
  CreateDesignationDto, UpdateDesignationDto,
  CreateLocationDto, UpdateLocationDto,
} from './dto/employee.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';
import { PermissionsService } from '../../rbac/permissions.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepo: Repository<BusinessUnit>,
    @InjectRepository(OrgFunction)
    private readonly functionRepo: Repository<OrgFunction>,
    @InjectRepository(SubFunction)
    private readonly subFunctionRepo: Repository<SubFunction>,
    @InjectRepository(Designation)
    private readonly designationRepo: Repository<Designation>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(EmployeeDocument)
    private readonly documentRepo: Repository<EmployeeDocument>,
    @InjectRepository(EmployeeTransfer)
    private readonly transferRepo: Repository<EmployeeTransfer>,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly permissionsService: PermissionsService,
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
    return this.employeeRepo.save(employee);
  }

  async resignEmployee(tenantId: string, id: string, dateOfLeaving: string): Promise<Employee> {
    const employee = await this.findEmployee(tenantId, id);
    employee.status = EmployeeStatus.RESIGNED;
    employee.dateOfLeaving = dateOfLeaving;
    return this.employeeRepo.save(employee);
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

  // Full org hierarchy: Business Unit > Department > Function > Sub Function.
  async getOrgTree(tenantId: string): Promise<any[]> {
    const [bus, depts, fns, subs] = await Promise.all([
      this.businessUnitRepo.find({ where: { tenantId } }),
      this.departmentRepo.find({ where: { tenantId } }),
      this.functionRepo.find({ where: { tenantId } }),
      this.subFunctionRepo.find({ where: { tenantId } }),
    ]);

    const subsByFn = new Map<string, any[]>();
    subs.forEach(s => {
      const arr = subsByFn.get(s.functionId) ?? [];
      arr.push({ ...s, level: 'subFunction' });
      subsByFn.set(s.functionId, arr);
    });

    const fnsByDept = new Map<string, any[]>();
    fns.forEach(f => {
      const node = { ...f, level: 'function', children: f.id ? (subsByFn.get(f.id) ?? []) : [] };
      const key = f.departmentId ?? '__none__';
      const arr = fnsByDept.get(key) ?? [];
      arr.push(node);
      fnsByDept.set(key, arr);
    });

    const deptsByBu = new Map<string, any[]>();
    depts.forEach(d => {
      const node = { ...d, level: 'department', children: fnsByDept.get(d.id) ?? [] };
      const key = d.businessUnitId ?? '__none__';
      const arr = deptsByBu.get(key) ?? [];
      arr.push(node);
      deptsByBu.set(key, arr);
    });

    const roots = bus.map(b => ({ ...b, level: 'businessUnit', children: deptsByBu.get(b.id) ?? [] }));

    // Surface any departments not yet linked to a business unit so nothing is hidden.
    const orphanDepts = deptsByBu.get('__none__') ?? [];
    if (orphanDepts.length) {
      roots.push({ id: '__unassigned__', code: 'UNASSIGNED', name: 'Unassigned', level: 'businessUnit', children: orphanDepts } as any);
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
}
