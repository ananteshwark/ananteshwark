import { Module } from '@nestjs/common';
import { ComponentModule } from './components/component.module';
import { RunModule } from './runs/run.module';
import { StatutoryModule } from './statutory/statutory.module';
import { RetroPayrollModule } from './retro/retro-payroll.module';

@Module({
  imports: [ComponentModule, RunModule, StatutoryModule, RetroPayrollModule],
  exports: [ComponentModule, RunModule, StatutoryModule, RetroPayrollModule],
})
export class PayrollModule {}
