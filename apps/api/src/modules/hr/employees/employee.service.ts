import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { Location } from './entities/location.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeTransfer, TransferStatus } from './entities/employee-transfer.entity';
import {
  CreateEmployeeDto, UpdateEmployeeDto,
  CreateDepartmentDto, UpdateDepartmentDto,
  CreateDesignationDto, UpdateDesignationDto,
  CreateLocationDto, UpdateLocationDto,
} from './dto/employee.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Designation)
    private readonly designationRepo: Repository<Designation>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(EmployeeDocument)
    private readonly documentRepo: Repository<EmployeeDocument>,
    @InjectRepository(EmployeeTransfer)
    private readonly transferRepo: Repository<EmployeeTransfer>,
  ) {}

  // ---- Employees ----
  async createEmployee(tenantId: string, dto: CreateEmployeeDto): Promise<Employee> {
    const existing = await this.employeeRepo.findOne({ where: { tenantId, employeeCode: dto.employeeCode } });
    if (existing) throw new ConflictException(`Employee code ${dto.employeeCode} already exists`);
    const existingEmail = await this.employeeRepo.findOne({ where: { tenantId, email: dto.email } });
    if (existingEmail) throw new ConflictException(`Email ${dto.email} already exists`);
    const employee = this.employeeRepo.create({ ...dto, tenantId, status: dto.status ?? EmployeeStatus.ACTIVE });
    return this.employeeRepo.save(employee);
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

  async getOrgTree(tenantId: string): Promise<any[]> {
    const all = await this.departmentRepo.find({ where: { tenantId } });
    const map = new Map<string, any>();
    all.forEach(d => map.set(d.id, { ...d, children: [] }));
    const roots: any[] = [];
    map.forEach(node => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
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
