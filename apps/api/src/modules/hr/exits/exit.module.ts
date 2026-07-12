import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExitRequest } from './entities/exit-request.entity';
import { ExitChecklistItem } from './entities/exit-checklist-item.entity';
import { FnfSettlement } from './entities/fnf-settlement.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ExitService } from './exit.service';
import { ExitController } from './exit.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { JourneysModule } from '../journeys/journeys.module';
import { AlumniModule } from '../alumni/alumni.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExitRequest,
      ExitChecklistItem,
      FnfSettlement,
      Employee,
    ]),
    RbacModule,
    JourneysModule,
    AlumniModule,
  ],
  controllers: [ExitController],
  providers: [ExitService],
  exports: [ExitService],
})
export class ExitModule {}
