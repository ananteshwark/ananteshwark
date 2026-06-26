import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Encumbrance } from './entities/encumbrance.entity';
import { BudgetLine } from '../budget/entities/budget-line.entity';
import { EncumbranceService } from './encumbrance.service';
import { EncumbranceController } from './encumbrance.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Encumbrance, BudgetLine]),
    RbacModule,
  ],
  controllers: [EncumbranceController],
  providers: [EncumbranceService],
  exports: [EncumbranceService],
})
export class EncumbranceModule {}
