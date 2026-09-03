import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './entities/attachment.entity';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';
import { ObjectStorageAdapter } from './object-storage.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  controllers: [AttachmentController],
  providers: [AttachmentService, ObjectStorageAdapter],
  exports: [AttachmentService, ObjectStorageAdapter],
})
export class DmsModule {}
