import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmContact } from './entities/crm-contact.entity';
import { CrmOpportunity } from './entities/crm-opportunity.entity';
import { CrmActivity } from './entities/crm-activity.entity';
import { CrmQuote } from './entities/crm-quote.entity';
import { ServiceTicket } from './entities/service-ticket.entity';
import { SlaPolicy } from './entities/sla-policy.entity';
import { TicketComment } from './entities/ticket-comment.entity';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { ServiceTicketService } from './service-ticket.service';
import { ServiceTicketController } from './service-ticket.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CrmContact,
      CrmOpportunity,
      CrmActivity,
      CrmQuote,
      ServiceTicket,
      SlaPolicy,
      TicketComment,
    ]),
    RbacModule,
  ],
  controllers: [CrmController, ServiceTicketController],
  providers: [CrmService, ServiceTicketService],
  exports: [CrmService, ServiceTicketService],
})
export class CrmModule {}
