import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseClaim } from '../expenses/entities/expense-claim.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { VendorInvoice } from '../procurement/vendor-invoice/entities/vendor-invoice.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { Payslip } from '../payroll/runs/entities/payslip.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { AiAnomalyService } from './ai-anomaly.service';
import { AiAnomalyController } from './ai-anomaly.controller';
import { CloseManagementModule } from '../finance/close/close-management.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpenseClaim, PurchaseOrder, VendorInvoice, SalesOrder, Invoice, Payslip, ServiceTicket,
    ]),
    CloseManagementModule, // journal anomaly detector feeds the finance scan
    RbacModule,
  ],
  controllers: [AiAnomalyController],
  providers: [AiAnomalyService],
  exports: [AiAnomalyService],
})
export class AiModule {}
