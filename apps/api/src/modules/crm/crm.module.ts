import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmContact } from './entities/crm-contact.entity';
import { CrmOpportunity } from './entities/crm-opportunity.entity';
import { CrmActivity } from './entities/crm-activity.entity';
import { CrmQuote } from './entities/crm-quote.entity';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CrmContact, CrmOpportunity, CrmActivity, CrmQuote]),
    RbacModule,
  ],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
