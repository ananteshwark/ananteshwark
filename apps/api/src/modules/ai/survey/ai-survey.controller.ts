import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AiSurveyService } from './ai-survey.service';

@ApiTags('ai-survey')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/survey')
export class AiSurveyController {
  constructor(private readonly service: AiSurveyService) {}

  @Post('sentiment')
  @RequirePermission('ai:survey:read')
  @ApiOperation({ summary: 'Score sentiment of one or more comments' })
  sentiment(@Body() body: { texts: string[] }) {
    return (body?.texts ?? []).map((text) => ({ text, ...AiSurveyService.scoreSentiment(text) }));
  }

  @Post('themes')
  @RequirePermission('ai:survey:read')
  @ApiOperation({ summary: 'Extract themes with counts and average sentiment' })
  themes(@Body() body: { comments: string[]; taxonomy?: Array<{ theme: string; keywords: string[] }> }) {
    return this.service.extractThemes(body?.comments ?? [], body?.taxonomy);
  }

  @Post('heatmap')
  @RequirePermission('ai:survey:read')
  @ApiOperation({ summary: 'Sentiment heatmap across a dimension' })
  heatmap(@Body() body: { responses: Array<{ text: string; dimension: string }> }) {
    return this.service.sentimentHeatmap(body?.responses ?? []);
  }

  @Post('impact')
  @RequirePermission('ai:survey:read')
  @ApiOperation({ summary: 'Theme impact on an outcome metric (with vs without)' })
  impact(@Body() body: { responses: Array<{ themes: string[]; outcomeScore: number }> }) {
    return this.service.impactAnalysis(body?.responses ?? []);
  }

  @Post('summary')
  @RequirePermission('ai:survey:read')
  @ApiOperation({ summary: 'Narrative digest of verbatims (LLM when enabled)' })
  summary(@Body() body: { comments: string[] }) {
    return this.service.summarize(body?.comments ?? []);
  }
}
