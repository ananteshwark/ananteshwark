import { Module } from '@nestjs/common';
import { LocalizationRegistry } from './localization.registry';
import { LocalizationController } from './localization.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [LocalizationController],
  providers: [LocalizationRegistry],
  exports: [LocalizationRegistry],
})
export class LocalizationModule {}
