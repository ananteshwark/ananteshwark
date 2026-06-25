import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lease } from './entities/lease.entity';
import { LeaseScheduleLine } from './entities/lease-schedule-line.entity';
import { Account } from '../gl/entities/account.entity';
import { LeaseService } from './lease.service';
import { LeaseController } from './lease.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lease, LeaseScheduleLine, Account]),
    GlModule,
    RbacModule,
  ],
  controllers: [LeaseController],
  providers: [LeaseService],
  exports: [LeaseService],
})
export class LeaseModule {}
