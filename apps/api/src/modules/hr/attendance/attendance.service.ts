import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceRecord, AttendanceSource, AttendanceStatus } from './entities/attendance-record.entity';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Holiday } from './entities/holiday.entity';
import { TimeEntry, TimeEntryStatus } from './entities/time-entry.entity';
import { Timesheet, TimesheetStatus } from './entities/timesheet.entity';
import { CreateShiftDto, UpdateShiftDto, CreateShiftAssignmentDto, CreateHolidayDto, MarkAttendanceDto, CreateTimeEntryDto } from './dto/attendance.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepo: Repository<AttendanceRecord>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(ShiftAssignment)
    private readonly shiftAssignmentRepo: Repository<ShiftAssignment>,
    @InjectRepository(Holiday)
    private readonly holidayRepo: Repository<Holiday>,
    @InjectRepository(TimeEntry)
    private readonly timeEntryRepo: Repository<TimeEntry>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepo: Repository<Timesheet>,
  ) {}

  // ---- Shifts ----
  async createShift(tenantId: string, dto: CreateShiftDto): Promise<Shift> {
    const shift = this.shiftRepo.create({ ...dto, tenantId });
    return this.shiftRepo.save(shift);
  }

  async findShifts(tenantId: string): Promise<Shift[]> {
    return this.shiftRepo.find({ where: { tenantId } });
  }

  async updateShift(tenantId: string, id: string, dto: UpdateShiftDto): Promise<Shift> {
    const shift = await this.shiftRepo.findOne({ where: { tenantId, id } });
    if (!shift) throw new NotFoundException(`Shift ${id} not found`);
    Object.assign(shift, dto);
    return this.shiftRepo.save(shift);
  }

  async createShiftAssignment(tenantId: string, dto: CreateShiftAssignmentDto): Promise<ShiftAssignment> {
    const sa = this.shiftAssignmentRepo.create({ ...dto, tenantId });
    return this.shiftAssignmentRepo.save(sa);
  }

  // ---- Holidays ----
  async createHoliday(tenantId: string, dto: CreateHolidayDto): Promise<Holiday> {
    const holiday = this.holidayRepo.create({ ...dto, tenantId });
    return this.holidayRepo.save(holiday);
  }

  async findHolidays(tenantId: string, year?: number): Promise<Holiday[]> {
    const qb = this.holidayRepo.createQueryBuilder('h').where('h.tenantId = :tenantId', { tenantId });
    if (year) {
      qb.andWhere("EXTRACT(YEAR FROM h.date::date) = :year", { year });
    }
    return qb.getMany();
  }

  // ---- Attendance ----
  async markAttendance(tenantId: string, dto: MarkAttendanceDto): Promise<AttendanceRecord> {
    const existing = await this.attendanceRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, date: dto.date } });

    let workingMinutes: number | null = null;
    if (dto.checkIn && dto.checkOut) {
      const checkIn = new Date(dto.checkIn);
      const checkOut = new Date(dto.checkOut);
      workingMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
    }

    if (existing) {
      if (dto.checkIn) existing.checkIn = new Date(dto.checkIn);
      if (dto.checkOut) existing.checkOut = new Date(dto.checkOut);
      if (workingMinutes !== null) existing.workingMinutes = workingMinutes;
      if (dto.source) existing.source = dto.source;
      if (dto.status) existing.status = dto.status;
      if (dto.remarks) existing.remarks = dto.remarks;
      return this.attendanceRepo.save(existing);
    }

    const record = this.attendanceRepo.create({
      tenantId,
      employeeId: dto.employeeId,
      date: dto.date,
      checkIn: dto.checkIn ? new Date(dto.checkIn) : null,
      checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
      workingMinutes,
      source: dto.source ?? AttendanceSource.MANUAL,
      status: dto.status ?? AttendanceStatus.PRESENT,
      remarks: dto.remarks,
    });
    return this.attendanceRepo.save(record);
  }

  async bulkImport(tenantId: string, records: MarkAttendanceDto[]): Promise<AttendanceRecord[]> {
    const results: AttendanceRecord[] = [];
    for (const rec of records) {
      results.push(await this.markAttendance(tenantId, rec));
    }
    return results;
  }

  async getMonthlyReport(tenantId: string, employeeId: string, month: number, year: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const records = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.date >= :startDate', { startDate })
      .andWhere('a.date <= :endDate', { endDate: endDateStr })
      .orderBy('a.date', 'ASC')
      .getMany();

    return records;
  }

  async findAttendance(tenantId: string, pagination: PaginationDto, filters?: { employeeId?: string; from?: string; to?: string; status?: string }): Promise<PaginatedResponseDto<AttendanceRecord>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.attendanceRepo.createQueryBuilder('a').where('a.tenantId = :tenantId', { tenantId });
    if (filters?.employeeId) qb.andWhere('a.employeeId = :eid', { eid: filters.employeeId });
    if (filters?.from) qb.andWhere('a.date >= :from', { from: filters.from });
    if (filters?.to) qb.andWhere('a.date <= :to', { to: filters.to });
    if (filters?.status) qb.andWhere('a.status = :status', { status: filters.status });
    qb.orderBy('a.date', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async regularize(tenantId: string, id: string, remarks: string, approvedById: string): Promise<AttendanceRecord> {
    const record = await this.attendanceRepo.findOne({ where: { tenantId, id } });
    if (!record) throw new NotFoundException(`Attendance record ${id} not found`);
    record.isRegularized = true;
    record.remarks = remarks;
    record.approvedById = approvedById;
    return this.attendanceRepo.save(record);
  }

  // ---- Time Entries ----
  async createTimeEntry(tenantId: string, dto: CreateTimeEntryDto): Promise<TimeEntry> {
    const entry = this.timeEntryRepo.create({ ...dto, tenantId });
    if (dto.startTime && dto.endTime) {
      const s = new Date(dto.startTime);
      const e = new Date(dto.endTime);
      entry.durationMinutes = Math.floor((e.getTime() - s.getTime()) / 60000);
    }
    return this.timeEntryRepo.save(entry);
  }

  async findTimeEntries(tenantId: string, employeeId: string, date?: string): Promise<TimeEntry[]> {
    const qb = this.timeEntryRepo.createQueryBuilder('te').where('te.tenantId = :tenantId', { tenantId }).andWhere('te.employeeId = :employeeId', { employeeId });
    if (date) qb.andWhere('te.date = :date', { date });
    return qb.orderBy('te.date', 'DESC').getMany();
  }

  async listTimesheets(tenantId: string, filters?: { employeeId?: string; status?: string }): Promise<Timesheet[]> {
    const where: any = { tenantId };
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.status) where.status = filters.status as TimesheetStatus;
    return this.timesheetRepo.find({ where, order: { weekStart: 'DESC' } });
  }

  async submitTimesheet(tenantId: string, employeeId: string, weekStart: string, weekEnd: string): Promise<Timesheet> {
    const existing = await this.timesheetRepo.findOne({ where: { tenantId, employeeId, weekStart } });
    if (existing) {
      existing.status = TimesheetStatus.SUBMITTED;
      existing.submittedAt = new Date();
      return this.timesheetRepo.save(existing);
    }
    const timesheet = this.timesheetRepo.create({
      tenantId, employeeId, weekStart, weekEnd,
      status: TimesheetStatus.SUBMITTED,
      submittedAt: new Date(),
    });
    return this.timesheetRepo.save(timesheet);
  }

  async approveTimesheet(tenantId: string, id: string, approvedById: string): Promise<Timesheet> {
    const ts = await this.timesheetRepo.findOne({ where: { tenantId, id } });
    if (!ts) throw new NotFoundException(`Timesheet ${id} not found`);
    ts.status = TimesheetStatus.APPROVED;
    ts.approvedById = approvedById;
    ts.approvedAt = new Date();
    return this.timesheetRepo.save(ts);
  }
}
