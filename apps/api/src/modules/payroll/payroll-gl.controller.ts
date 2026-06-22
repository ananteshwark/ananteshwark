import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PayrollGlService } from './payroll-gl.service';
import { PayrollGlComponentType } from './entities/payroll-gl-mapping.entity';

class GlMappingItemDto {
  @IsEnum(PayrollGlComponentType)
  componentType: PayrollGlComponentType;

  @IsOptional()
  @IsString()
  componentCode?: string | null;

  @IsOptional()
  @IsUUID()
  debitAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  creditAccountId?: string | null;
}

class SaveGlMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GlMappingItemDto)
  items: GlMappingItemDto[];
}

@ApiTags('payroll-gl')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll')
export class PayrollGlController {
  constructor(private readonly service: PayrollGlService) {}

  @Get('gl-mappings')
  @RequirePermission('payroll:components:read')
  getMappings(@CurrentUser() user: any) {
    return this.service.getMappings(user.tenantId);
  }

  @Post('gl-mappings')
  @RequirePermission('payroll:components:manage')
  saveMappings(@CurrentUser() user: any, @Body() dto: SaveGlMappingsDto) {
    return this.service.saveMappings(user.tenantId, dto.items ?? []);
  }

  @Post('runs/:id/post-gl')
  @RequirePermission('payroll:runs:approve')
  postToGl(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.postPayrollToGl(user.tenantId, id);
  }
}
