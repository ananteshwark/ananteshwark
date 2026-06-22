import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExitRequest } from './entities/exit-request.entity';
import { ExitChecklistItem } from './entities/exit-checklist-item.entity';
import { FnfSettlement } from './entities/fnf-settlement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ExitService } from './exit.service';
import { ExitController } from './exit.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExitRequest,
      ExitChecklistItem,
      FnfSettlement,
      Employee,
    ]),
    RbacModule,
  ],
  controllers: [ExitController],
  providers: [ExitService],
  exports: [ExitService],
})
export class ExitModule {}
