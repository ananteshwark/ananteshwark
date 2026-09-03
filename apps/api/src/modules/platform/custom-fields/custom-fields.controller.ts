import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDefinitionDto,
  UpdateCustomFieldDefinitionDto,
  BulkSetCustomFieldValuesDto,
} from './dto/custom-fields.dto';
import { CustomFieldEntityType } from './entities/custom-field-definition.entity';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('platform/custom-fields')
export class CustomFieldsController {
  constructor(private readonly svc: CustomFieldsService) {}

  // ─── Definitions ─────────────────────────────────────────────────────────────

  @Get('definitions')
  @RequirePermission('platform.customfields.read')
  listDefinitions(
    @CurrentUser() user: { tenantId: string },
    @Query('entityType') entityType?: CustomFieldEntityType,
  ) {
    return this.svc.listDefinitions(user.tenantId, entityType);
  }

  @Post('definitions')
  @RequirePermission('platform.customfields.write')
  createDefinition(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateCustomFieldDefinitionDto,
  ) {
    return this.svc.createDefinition(user.tenantId, dto);
  }

  @Get('definitions/:id')
  @RequirePermission('platform.customfields.read')
  getDefinition(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getDefinition(user.tenantId, id);
  }

  @Patch('definitions/:id')
  @RequirePermission('platform.customfields.write')
  updateDefinition(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomFieldDefinitionDto,
  ) {
    return this.svc.updateDefinition(user.tenantId, id, dto);
  }

  @Delete('definitions/:id')
  @RequirePermission('platform.customfields.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDefinition(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteDefinition(user.tenantId, id);
  }

  // ─── Values ───────────────────────────────────────────────────────────────────

  @Get('values/:entityType/:entityId')
  @RequirePermission('platform.customfields.read')
  getValues(
    @CurrentUser() user: { tenantId: string },
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.svc.getEntityValues(user.tenantId, entityType.toUpperCase(), entityId);
  }

  @Get('values/:entityType/:entityId/meta')
  @RequirePermission('platform.customfields.read')
  getValuesWithMeta(
    @CurrentUser() user: { tenantId: string },
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.svc.getEntityValuesWithMeta(user.tenantId, entityType.toUpperCase(), entityId);
  }

  @Post('values/:entityType/:entityId')
  @RequirePermission('platform.customfields.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  setValues(
    @CurrentUser() user: { tenantId: string },
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() dto: BulkSetCustomFieldValuesDto,
  ) {
    return this.svc.bulkSetValues(user.tenantId, entityType.toUpperCase(), entityId, dto);
  }
}
