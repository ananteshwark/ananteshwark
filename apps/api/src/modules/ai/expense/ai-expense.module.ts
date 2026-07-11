import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrUsage } from './entities/ocr-usage.entity';
import { AiExpenseService } from './ai-expense.service';
import { AiExpenseController } from './ai-expense.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([OcrUsage]), RbacModule],
  controllers: [AiExpenseController],
  providers: [AiExpenseService],
  exports: [AiExpenseService],
})
export class AiExpenseModule {}
