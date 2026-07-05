import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Tenant } from '../modules/tenants/entities/tenant.entity';
import { User } from '../modules/users/entities/user.entity';
import { Role } from '../modules/rbac/entities/role.entity';
import { UserRole } from '../modules/rbac/entities/user-role.entity';
import { WorkflowDefinition } from '../modules/workflow/entities/workflow-definition.entity';
import { WorkflowInstance } from '../modules/workflow/entities/workflow-instance.entity';
import { Notification } from '../modules/notifications/entities/notification.entity';
import { NotificationTemplate } from '../modules/notifications/entities/notification-template.entity';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';

export const getDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: config.get('DATABASE_URL'),
  entities: [
    Tenant,
    User,
    Role,
    UserRole,
    WorkflowDefinition,
    WorkflowInstance,
    Notification,
    NotificationTemplate,
    AuditLog,
  ],
  // Pull in every entity registered via TypeOrmModule.forFeature() across all
  // feature modules so synchronize can create their tables too.
  autoLoadEntities: true,
  // Development iterates via synchronize; production evolves the schema ONLY
  // through versioned migrations (the baseline migration adopts schemas that
  // were previously created by synchronize).
  synchronize: config.get('APP_ENV') === 'development',
  logging: config.get('APP_ENV') === 'development',
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: config.get('APP_ENV') === 'production',
});
