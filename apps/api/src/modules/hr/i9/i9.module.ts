import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I9Case } from './entities/i9-case.entity';
import { I9Service } from './i9.service';
import { I9Controller } from './i9.controller';
import { EVerifyAdapter } from './everify.adapter';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([I9Case]), RbacModule],
  controllers: [I9Controller],
  providers: [I9Service, EVerifyAdapter],
  exports: [I9Service],
})
export class I9Module {}
