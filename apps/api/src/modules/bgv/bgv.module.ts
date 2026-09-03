import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BgvCase, BgvCheck } from './entities/bgv.entity';
import { BgvService } from './bgv.service';
import { BgvController } from './bgv.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([BgvCase, BgvCheck]), RbacModule],
  controllers: [BgvController],
  providers: [BgvService],
  exports: [BgvService],
})
export class BgvModule {}
