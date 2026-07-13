import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService, RunQuery } from './reports.service';

/**
 * Access control is dynamic here: each report definition carries its own
 * permission (the backing module's read permission), enforced inside the
 * service per user — so no static @RequirePermission on these routes, and
 * the catalog only lists reports the caller can actually run.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Reports the caller may run, grouped by module' })
  catalog(@CurrentUser() user: any) {
    return this.service.catalogFor(user.id, user.tenantId);
  }

  @Post('views')
  @ApiOperation({ summary: 'Save the current filters + sort as a named view (optionally tenant-shared)' })
  saveView(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.saveView(user.id, user.tenantId, dto ?? {});
  }

  @Delete('views/:id')
  @ApiOperation({ summary: 'Delete a saved view (creator only)' })
  deleteView(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteView(user.id, user.tenantId, id);
  }

  @Get(':code/views')
  @ApiOperation({ summary: 'Saved views for a report: yours plus tenant-shared' })
  listViews(@CurrentUser() user: any, @Param('code') code: string) {
    return this.service.listViews(user.id, user.tenantId, code);
  }

  @Get(':code/describe')
  @ApiOperation({ summary: 'Columns, types and available filter operators for a report' })
  describe(@CurrentUser() user: any, @Param('code') code: string) {
    return this.service.describe(user.id, user.tenantId, code);
  }

  @Post(':code/run')
  @ApiOperation({ summary: 'Run a report with filters, sorting and pagination' })
  run(@CurrentUser() user: any, @Param('code') code: string, @Body() query: RunQuery) {
    return this.service.run(user.id, user.tenantId, code, query ?? {});
  }

  @Post(':code/export')
  @ApiOperation({ summary: 'Export a filtered report as CSV' })
  async export(
    @CurrentUser() user: any,
    @Param('code') code: string,
    @Body() query: RunQuery,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.service.exportCsv(user.id, user.tenantId, code, query ?? {});
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}
