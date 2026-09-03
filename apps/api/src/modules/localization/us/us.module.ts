import { Module } from '@nestjs/common';
import { UsStatutoryService } from './us-statutory.service';
import { LocalizationModule } from '../localization.module';

@Module({
  imports: [LocalizationModule],
  providers: [UsStatutoryService],
  exports: [UsStatutoryService],
})
export class UsModule {}
