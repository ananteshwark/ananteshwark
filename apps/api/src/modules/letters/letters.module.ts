import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LetterTemplate, IssuedLetter } from './entities/letter.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { LettersService } from './letters.service';
import { LettersController } from './letters.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([LetterTemplate, IssuedLetter, Employee]), RbacModule],
  controllers: [LettersController],
  providers: [LettersService],
  exports: [LettersService],
})
export class LettersModule {}
