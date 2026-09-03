import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Questionnaire } from './entities/questionnaire.entity';
import { QuestionnaireResponse } from './entities/questionnaire-response.entity';
import { SupplierCertificate } from './entities/supplier-certificate.entity';
import { SupplierScorecard } from './entities/supplier-scorecard.entity';
import { SupplierQualificationService } from './supplier-qualification.service';
import { SupplierQualificationController } from './supplier-qualification.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Questionnaire, QuestionnaireResponse, SupplierCertificate, SupplierScorecard]),
    RbacModule,
  ],
  controllers: [SupplierQualificationController],
  providers: [SupplierQualificationService],
  exports: [SupplierQualificationService],
})
export class SupplierQualificationModule {}
