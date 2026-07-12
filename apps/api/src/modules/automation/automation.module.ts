import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationRun } from './entities/automation-run.entity';
import { AutomationService } from './automation.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { AutomationController } from './automation.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../platform/webhooks/webhooks.module';
import { EmailModule } from '../email/email.module';
import { RbacModule } from '../rbac/rbac.module';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { SkillAttestation } from '../hr/skills/entities/skill-attestation.entity';
import { CertEnrollment } from '../learning/academy/entities/academy.entity';
import { Visitor } from '../platform/device/entities/device.entity';
import { I9Case } from '../hr/i9/entities/i9-case.entity';
import { IntegrationsModule } from '../studio/integrations/integrations.module';

// Global so every business service can emit events via @Optional() injection
// without adding an import to each feature module.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationRule, AutomationRun, Invoice, ServiceTicket, Contract, SkillAttestation, CertEnrollment, Visitor, I9Case]),
    NotificationsModule,
    WebhooksModule,
    EmailModule,
    RbacModule,
    IntegrationsModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationSchedulerService],
  exports: [AutomationService],
})
export class AutomationModule {}
