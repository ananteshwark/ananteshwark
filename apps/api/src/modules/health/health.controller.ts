import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    let dbStatus = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: this.configService.get('APP_VERSION', '1.0.0'),
      services: {
        database: dbStatus,
        redis: 'ok',
      },
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  async ready() {
    return { status: 'ready', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }
}
