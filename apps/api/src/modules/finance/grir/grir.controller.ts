import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { GrirService } from './grir.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';

@Controller('finance/grir')
@UseGuards(JwtAuthGuard)
export class GrirController {
  constructor(private readonly grirService: GrirService) {}

  @Get('open')
  async getOpenItems(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.grirService.getOpenItems(tenantId);
  }

  @Get('report')
  async getReport(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.grirService.getReport(tenantId);
  }

  @Post('auto-match')
  async autoMatch(@Request() req: any) {
    const tenantId = req.user?.tenantId;
    return this.grirService.autoMatch(tenantId);
  }
}
