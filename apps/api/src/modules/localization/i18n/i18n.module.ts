import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nLocale } from './entities/locale.entity';
import { I18nTranslation } from './entities/translation.entity';
import { I18nService } from './i18n.service';
import { I18nController } from './i18n.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([I18nLocale, I18nTranslation]),
    RbacModule,
  ],
  controllers: [I18nController],
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
