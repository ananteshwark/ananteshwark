import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotGenealogy } from './entities/lot-genealogy.entity';
import { LotSerial } from '../entities/lot-serial.entity';
import { GenealogyService } from './genealogy.service';
import { GenealogyController } from './genealogy.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LotGenealogy, LotSerial]),
    RbacModule,
  ],
  controllers: [GenealogyController],
  providers: [GenealogyService],
  exports: [GenealogyService],
})
export class GenealogyModule {}
