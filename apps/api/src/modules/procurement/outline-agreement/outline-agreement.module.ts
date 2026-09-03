import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutlineAgreement } from './entities/outline-agreement.entity';
import { OutlineAgreementService } from './outline-agreement.service';
import { OutlineAgreementController } from './outline-agreement.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([OutlineAgreement]), RbacModule],
  controllers: [OutlineAgreementController],
  providers: [OutlineAgreementService],
  exports: [OutlineAgreementService],
})
export class OutlineAgreementModule {}
