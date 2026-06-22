import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrirEntry } from './entities/grir-entry.entity';
import { GrirService } from './grir.service';
import { GrirController } from './grir.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GrirEntry])],
  controllers: [GrirController],
  providers: [GrirService],
  exports: [GrirService],
})
export class GrirModule {}
