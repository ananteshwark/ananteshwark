import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from './entities/course.entity';
import { CourseEnrollment, EnrollmentStatus } from './entities/course-enrollment.entity';
import { SkillMatrix } from './entities/skill-matrix.entity';
import { CreateCourseDto, EnrollDto, UpdateEnrollmentDto, UpsertSkillDto } from './dto/learning.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(CourseEnrollment) private enrollRepo: Repository<CourseEnrollment>,
    @InjectRepository(SkillMatrix) private skillRepo: Repository<SkillMatrix>,
  ) {}

  async createCourse(tenantId: string, dto: CreateCourseDto): Promise<Course> {
    const course = this.courseRepo.create({ ...dto, tenantId, isActive: true });
    return this.courseRepo.save(course);
  }

  async listCourses(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Course>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const [items, total] = await this.courseRepo.findAndCount({
      where: { tenantId, isActive: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async enroll(tenantId: string, dto: EnrollDto): Promise<CourseEnrollment> {
    const enrollment = this.enrollRepo.create({ ...dto, tenantId, status: EnrollmentStatus.ENROLLED, enrolledAt: new Date() });
    return this.enrollRepo.save(enrollment);
  }

  async updateEnrollment(tenantId: string, id: string, dto: UpdateEnrollmentDto): Promise<CourseEnrollment> {
    const enrollment = await this.enrollRepo.findOne({ where: { id, tenantId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    Object.assign(enrollment, dto);
    if (dto.status === EnrollmentStatus.COMPLETED) {
      enrollment.completedAt = new Date();
    }
    return this.enrollRepo.save(enrollment);
  }

  async getMyEnrollments(tenantId: string, employeeId: string): Promise<CourseEnrollment[]> {
    return this.enrollRepo.find({ where: { tenantId, employeeId }, order: { enrolledAt: 'DESC' } });
  }

  async upsertSkill(tenantId: string, dto: UpsertSkillDto): Promise<SkillMatrix> {
    const existing = await this.skillRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, skill: dto.skill } });
    if (existing) {
      Object.assign(existing, dto);
      return this.skillRepo.save(existing);
    }
    const skill = this.skillRepo.create({ ...dto, tenantId });
    return this.skillRepo.save(skill);
  }

  async getEmployeeSkills(tenantId: string, employeeId: string): Promise<SkillMatrix[]> {
    return this.skillRepo.find({ where: { tenantId, employeeId } });
  }
}
