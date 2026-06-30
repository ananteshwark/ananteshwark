import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KbArticle } from './entities/kb-article.entity';
import { EmailRoutingRule } from './entities/email-routing-rule.entity';
import { ServiceTicket } from '../entities/service-ticket.entity';
import { ServiceDeskService } from './service-desk.service';
import { ServiceDeskController } from './service-desk.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KbArticle, EmailRoutingRule, ServiceTicket]),
    RbacModule,
  ],
  controllers: [ServiceDeskController],
  providers: [ServiceDeskService],
  exports: [ServiceDeskService],
})
export class ServiceDeskModule {}
