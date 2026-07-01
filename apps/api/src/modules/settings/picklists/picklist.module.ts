import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Picklist, PicklistOption } from './picklist.entity';
import { PicklistService } from './picklist.service';
import { PicklistController } from './picklist.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([Picklist, PicklistOption]), RbacModule],
  controllers: [PicklistController],
  providers: [PicklistService],
  exports: [PicklistService],
})
export class PicklistModule {}
