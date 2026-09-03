import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Formula, FormulaDetail } from './entities/formula.entity';
import { Batch } from './entities/batch.entity';
import { OpmService } from './opm.service';
import { OpmController } from './opm.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Formula, FormulaDetail, Batch]),
    RbacModule,
  ],
  controllers: [OpmController],
  providers: [OpmService],
  exports: [OpmService],
})
export class OpmModule {}
