import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormDefinition, FormSubmission } from './entities/form.entity';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([FormDefinition, FormSubmission]), RbacModule],
  controllers: [FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
