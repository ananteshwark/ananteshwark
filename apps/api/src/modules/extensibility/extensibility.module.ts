import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomObject } from './entities/custom-object.entity';
import { CustomRecord } from './entities/custom-record.entity';
import { ValidationRule } from './entities/validation-rule.entity';
import { ExtensibilityService } from './extensibility.service';
import { ExtensibilityController } from './extensibility.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomObject, CustomRecord, ValidationRule]),
    RbacModule,
  ],
  controllers: [ExtensibilityController],
  providers: [ExtensibilityService],
  exports: [ExtensibilityService],
})
export class ExtensibilityModule {}
