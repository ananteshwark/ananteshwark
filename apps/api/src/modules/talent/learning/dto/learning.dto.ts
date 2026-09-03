import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseType } from '../entities/course.entity';
import { Proficiency } from '../entities/skill-matrix.entity';

export class CreateCourseDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: CourseType }) @IsOptional() @IsEnum(CourseType) type?: CourseType;
  @ApiProperty() @IsNumber() durationHours: number;
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() skillTags?: string[];
}

export class EnrollDto {
  @ApiProperty() @IsString() courseId: string;
  @ApiProperty() @IsString() employeeId: string;
}

export class UpdateEnrollmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() score?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() certificateUrl?: string;
}

export class UpsertSkillDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsString() skill: string;
  @ApiPropertyOptional({ enum: Proficiency }) @IsOptional() @IsEnum(Proficiency) proficiency?: Proficiency;
  @ApiPropertyOptional() @IsOptional() @IsString() endorsedBy?: string;
  @ApiProperty() @IsString() assessedAt: string;
}
