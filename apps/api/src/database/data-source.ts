import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * CLI DataSource for TypeORM migrations (`npm run migration:*`).
 *
 * Entities are loaded by glob so the CLI sees the same schema the app
 * registers via forFeature()/autoLoadEntities. Runtime migration execution is
 * configured separately in src/config/database.config.ts (migrationsRun is
 * enabled when APP_ENV=production).
 */
const isCompiled = __filename.endsWith('.js');

// Exactly ONE export of a DataSource: TypeORM's CLI (`loadDataSource`) counts
// the exports of this file and refuses a file that has more than one, so a
// `export default AppDataSource` alongside this named export made every
// `migration:*` script fail before it opened a connection.
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Match the runtime SSL behavior (see config/database.config.ts) so the
  // migration CLI can also reach a managed Postgres over TLS.
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  entities: [isCompiled ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [isCompiled ? 'dist/database/migrations/*.js' : 'src/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: ['error', 'migration'],
});
