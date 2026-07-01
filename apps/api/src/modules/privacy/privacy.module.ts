import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PiiField } from './entities/pii-field.entity';
import { Consent } from './entities/consent.entity';
import { ErasureRequest } from './entities/erasure-request.entity';
import { DsarRequest } from './entities/dsar-request.entity';
import { PrivacyService } from './privacy.service';
import { PrivacyController } from './privacy.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PiiField, Consent, ErasureRequest, DsarRequest]),
    RbacModule,
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
