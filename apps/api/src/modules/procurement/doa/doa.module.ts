import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelegationAuthority } from './entities/delegation-authority.entity';
import { DoaService } from './doa.service';
import { DoaController } from './doa.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([DelegationAuthority]), RbacModule],
  controllers: [DoaController],
  providers: [DoaService],
  exports: [DoaService],
})
export class DoaModule {}
