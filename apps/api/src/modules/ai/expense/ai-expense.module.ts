import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrUsage } from './entities/ocr-usage.entity';
import { AiExpenseService } from './ai-expense.service';
import { AiExpenseController } from './ai-expense.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { LicensingModule } from '../../licensing/licensing.module';

@Module({
  imports: [TypeOrmModule.forFeature([OcrUsage]), RbacModule, LicensingModule],
  controllers: [AiExpenseController],
  providers: [AiExpenseService],
  exports: [AiExpenseService],
})
export class AiExpenseModule {}
