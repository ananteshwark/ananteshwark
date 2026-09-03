import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlumniProfile, AlumniDocument, AlumniTicket } from './entities/alumni.entity';
import { AlumniService } from './alumni.service';
import { AlumniController } from './alumni.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([AlumniProfile, AlumniDocument, AlumniTicket]), RbacModule],
  controllers: [AlumniController],
  providers: [AlumniService],
  exports: [AlumniService],
})
export class AlumniModule {}
