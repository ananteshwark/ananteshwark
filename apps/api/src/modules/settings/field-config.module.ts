import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfig } from './field-config.entity';
import { FieldConfigService } from './field-config.service';
import { FieldConfigController } from './field-config.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([FieldConfig]), RbacModule],
  controllers: [FieldConfigController],
  providers: [FieldConfigService],
  exports: [FieldConfigService],
})
export class SettingsModule {}
