import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LegislativeDataGroup } from './entities/legislative-data-group.entity';
import { LdgService } from './ldg.service';
import { LdgController } from './ldg.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LegislativeDataGroup]),
    RbacModule,
  ],
  controllers: [LdgController],
  providers: [LdgService],
  exports: [LdgService],
})
export class LdgModule {}
