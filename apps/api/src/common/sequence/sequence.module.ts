import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentSequence } from './document-sequence.entity';
import { SequenceService } from './sequence.service';

/**
 * Global so any feature module can inject SequenceService for atomic,
 * collision-free document numbering without wiring it per module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([DocumentSequence])],
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
