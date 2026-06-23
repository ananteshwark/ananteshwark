import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IcRelationship } from './entities/ic-relationship.entity';
import { IcTransaction } from './entities/ic-transaction.entity';
import { LegalEntity } from '../../hr/employees/entities/legal-entity.entity';
import { IntercompanyService } from './intercompany.service';
import { IntercompanyController } from './intercompany.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IcRelationship, IcTransaction, LegalEntity]),
    RbacModule,
  ],
  controllers: [IntercompanyController],
  providers: [IntercompanyService],
  exports: [IntercompanyService],
})
export class IntercompanyModule {}
