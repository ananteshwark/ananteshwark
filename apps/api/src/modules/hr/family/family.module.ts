import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dependent } from './entities/dependent.entity';
import { Nominee } from './entities/nominee.entity';
import { Employee } from '../employees/entities/employee.entity';
import { FamilyService } from './family.service';
import { FamilyController } from './family.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dependent, Nominee, Employee]),
    RbacModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
