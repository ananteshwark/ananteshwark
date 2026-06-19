import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LocalizationRegistry } from './localization.registry';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@ApiTags('localization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('localization')
export class LocalizationController {
  constructor(private readonly registry: LocalizationRegistry) {}

  @Get('countries')
  @RequirePermission('localization:read')
  getSupportedCountries() {
    const packs = this.registry.list();
    return {
      countries: packs.map((pack) => ({
        country: pack.country,
        name: pack.name,
      })),
      total: packs.length,
    };
  }

  @Get('calculate')
  @RequirePermission('localization:read')
  calculateTax(
    @Query('country') country: string,
    @Query('grossMonthly') grossMonthlyStr: string,
    @Query('basicMonthly') basicMonthlyStr?: string,
  ) {
    const grossMonthly = parseFloat(grossMonthlyStr || '0');
    const basicMonthly = parseFloat(basicMonthlyStr || String(grossMonthly * 0.4));
    const annualTaxableIncome = grossMonthly * 12;

    const pack = this.registry.get(country);
    if (!pack) {
      return {
        error: `Localization pack for country '${country}' not found`,
        supportedCountries: this.registry.getSupportedCountries(),
      };
    }

    const result = pack.calculateStatutory({
      grossMonthly,
      basicMonthly,
      annualTaxableIncome,
      country,
    });

    const totalEmployeeDeductions = result.employeeDeductions.reduce(
      (sum, d) => sum + d.amount,
      0,
    );
    const totalEmployerContributions = result.employerContributions.reduce(
      (sum, c) => sum + c.amount,
      0,
    );

    return {
      country,
      packName: pack.name,
      grossMonthly: round2(grossMonthly),
      basicMonthly: round2(basicMonthly),
      employeeDeductions: result.employeeDeductions,
      employerContributions: result.employerContributions,
      totalEmployeeDeductions: round2(totalEmployeeDeductions),
      totalEmployerContributions: round2(totalEmployerContributions),
      netPay: round2(grossMonthly - totalEmployeeDeductions),
    };
  }
}
