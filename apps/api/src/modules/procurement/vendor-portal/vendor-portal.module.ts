import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Vendor } from '../../finance/ap/entities/vendor.entity';
import { Rfq } from '../rfq/entities/rfq.entity';
import { RfqVendor } from '../rfq/entities/rfq-vendor.entity';
import { RfqQuote } from '../rfq/entities/rfq-quote.entity';
import { PurchaseOrder } from '../po/entities/purchase-order.entity';
import { VendorPortalService } from './vendor-portal.service';
import { VendorPortalController } from './vendor-portal.controller';
import { VendorAuthGuard } from './guards/vendor-auth.guard';
import { VendorInvoiceModule } from '../vendor-invoice/vendor-invoice.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vendor, Rfq, RfqVendor, RfqQuote, PurchaseOrder]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'default-secret'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
    VendorInvoiceModule,
    RbacModule,
  ],
  controllers: [VendorPortalController],
  providers: [VendorPortalService, VendorAuthGuard],
  exports: [VendorPortalService],
})
export class VendorPortalModule {}
