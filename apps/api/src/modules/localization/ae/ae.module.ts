import { Module } from '@nestjs/common';
import { AeStatutoryService } from './ae-statutory.service';
import { LocalizationModule } from '../localization.module';

@Module({
  imports: [LocalizationModule],
  providers: [AeStatutoryService],
  exports: [AeStatutoryService],
})
export class AeModule {}
