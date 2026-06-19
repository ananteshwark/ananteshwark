import { Module } from '@nestjs/common';
import { ComponentModule } from './components/component.module';
import { RunModule } from './runs/run.module';
import { StatutoryModule } from './statutory/statutory.module';

@Module({
  imports: [ComponentModule, RunModule, StatutoryModule],
  exports: [ComponentModule, RunModule, StatutoryModule],
})
export class PayrollModule {}
