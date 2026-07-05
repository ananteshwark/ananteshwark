import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Prometheus scrape endpoint. Exposes only aggregate counters — no tenant
  // or user data — so it is safe to leave scrapeable inside the network.
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics (aggregate request counters)' })
  prometheus(): string {
    return this.metrics.renderPrometheus();
  }

  @Public()
  @Get('summary')
  @ApiOperation({ summary: 'Human-readable metrics summary' })
  summary() {
    return this.metrics.snapshot();
  }
}
