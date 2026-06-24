import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SsoProvider } from '../entities/sso-provider.entity';
import { User } from '../../users/entities/user.entity';
import { SsoService } from './sso.service';
import { SsoController } from './sso.controller';
import { TenantsModule } from '../../tenants/tenants.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SsoProvider, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'default-secret'),
        signOptions: { expiresIn: config.get('JWT_EXPIRATION', '15m') },
      }),
    }),
    TenantsModule,
    RbacModule,
  ],
  controllers: [SsoController],
  providers: [SsoService],
  exports: [SsoService],
})
export class SsoModule {}
