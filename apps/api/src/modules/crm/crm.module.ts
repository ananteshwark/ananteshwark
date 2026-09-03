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
import { Customer360Service } from './customer-360.service';
import { Customer360Controller } from './customer-360.controller';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { CustomerReceipt } from '../finance/ar/entities/customer-receipt.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
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
      Customer,
      Invoice,
      CustomerReceipt,
      SalesOrder,
    ]),
    RbacModule,
  ],
  controllers: [CrmController, ServiceTicketController, Customer360Controller],
  providers: [CrmService, ServiceTicketService, Customer360Service],
  exports: [CrmService, ServiceTicketService, Customer360Service],
})
export class CrmModule {}
