import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import * as path from 'path';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentController {
  constructor(private readonly service: AttachmentService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Body('entityType') entityType: string,
    @Body('entityId') entityId: string,
    @Body('description') description?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    return this.service.upload(
      user.tenantId,
      entityType,
      entityId,
      user.id ?? user.userId,
      file,
      description,
    );
  }

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.service.list(user.tenantId, entityType, entityId);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const att = await this.service.findById(user.tenantId, id);
    res.set({
      'Content-Type': att.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(att.originalName)}"`,
    });
    res.sendFile(path.resolve(att.storagePath));
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.delete(user.tenantId, id);
  }
}
