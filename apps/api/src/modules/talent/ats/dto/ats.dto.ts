import { IsString, IsOptional, IsEnum, IsNumber, IsDateString, IsArray, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType, JobStatus } from '../entities/job-posting.entity';
import { ApplicantSource } from '../entities/applicant.entity';
import { InterviewType } from '../entities/interview-schedule.entity';
import { Type } from 'class-transformer';

export class CreateJobPostingDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() designationId?: string;
  @ApiPropertyOptional({ enum: JobType }) @IsOptional() @IsEnum(JobType) type?: JobType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) vacancies?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salaryMax?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requirements?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() closingDate?: string;
}

export class SubmitApplicationDto {
  @ApiProperty() @IsString() jobPostingId: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsString() email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() resumeUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() coverLetter?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentCompany?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentDesignation?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() totalExperience?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() expectedSalary?: number;
  @ApiPropertyOptional({ enum: ApplicantSource }) @IsOptional() @IsEnum(ApplicantSource) source?: ApplicantSource;
  @ApiPropertyOptional() @IsOptional() @IsString() referredById?: string;
}

export class ScheduleInterviewDto {
  @ApiProperty() @IsString() applicantId: string;
  @ApiProperty() @IsString() jobPostingId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() round?: number;
  @ApiPropertyOptional({ enum: InterviewType }) @IsOptional() @IsEnum(InterviewType) interviewType?: InterviewType;
  @ApiProperty() @IsString() scheduledAt: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() durationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() interviewerIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() meetingLink?: string;
}

export class RecordFeedbackDto {
  @ApiPropertyOptional() @IsOptional() @IsString() feedback?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() recommendation?: string;
}

export class MakeOfferDto {
  @ApiProperty() @IsString() applicantId: string;
  @ApiProperty() @IsString() jobPostingId: string;
  @ApiProperty() @IsNumber() offeredSalary: number;
  @ApiProperty() @IsString() joiningDate: string;
  @ApiProperty() @IsString() offerDate: string;
  @ApiProperty() @IsString() validUntil: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terms?: string;
}
