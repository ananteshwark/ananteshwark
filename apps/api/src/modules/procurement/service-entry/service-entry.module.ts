import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceEntrySheet } from './entities/service-entry-sheet.entity';
import { ServiceEntryService } from './service-entry.service';
import { ServiceEntryController } from './service-entry.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { PoModule } from '../po/po.module';
import { GrirModule } from '../../finance/grir/grir.module';
import { GlModule } from '../../finance/gl/gl.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceEntrySheet]),
    RbacModule,
    PoModule,
    GrirModule,
    GlModule,
  ],
  controllers: [ServiceEntryController],
  providers: [ServiceEntryService],
  exports: [ServiceEntryService],
})
export class ServiceEntryModule {}
