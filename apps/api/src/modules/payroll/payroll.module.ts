import { Module } from '@nestjs/common';
import { ComponentModule } from './components/component.module';
import { RunModule } from './runs/run.module';
import { StatutoryModule } from './statutory/statutory.module';
import { StatutoryFormsModule } from './statutory/forms/statutory-forms.module';
import { RetroPayrollModule } from './retro/retro-payroll.module';

@Module({
  imports: [ComponentModule, RunModule, StatutoryModule, StatutoryFormsModule, RetroPayrollModule],
  exports: [ComponentModule, RunModule, StatutoryModule, StatutoryFormsModule, RetroPayrollModule],
})
export class PayrollModule {}
