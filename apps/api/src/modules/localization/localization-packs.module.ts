import { Module } from '@nestjs/common';
import { LocalizationModule } from './localization.module';
import { UsModule } from './us/us.module';
import { AeModule } from './ae/ae.module';

/**
 * Composes the core LocalizationModule with all country pack modules.
 * Import this in AppModule.
 */
@Module({
  imports: [LocalizationModule, UsModule, AeModule],
  exports: [LocalizationModule],
})
export class LocalizationPacksModule {}
