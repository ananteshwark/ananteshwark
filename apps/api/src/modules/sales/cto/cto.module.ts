import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CtoOptionMapping, CtoConfiguration } from './entities/cto.entity';
import { CtoService } from './cto.service';
import { CtoController } from './cto.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([CtoOptionMapping, CtoConfiguration]), RbacModule],
  controllers: [CtoController],
  providers: [CtoService],
  exports: [CtoService],
})
export class CtoModule {}
