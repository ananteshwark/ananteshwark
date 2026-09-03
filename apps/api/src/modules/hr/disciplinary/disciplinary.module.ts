import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisciplinaryCase, DisciplinaryAction, DisciplinaryEvent } from './entities/disciplinary.entity';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryController } from './disciplinary.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([DisciplinaryCase, DisciplinaryAction, DisciplinaryEvent]), RbacModule],
  controllers: [DisciplinaryController],
  providers: [DisciplinaryService],
  exports: [DisciplinaryService],
})
export class DisciplinaryModule {}
