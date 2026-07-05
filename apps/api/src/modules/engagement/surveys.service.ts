import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Survey, SurveyStatus, SurveyQuestion } from './entities/survey.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class SurveysService {
  constructor(
    @InjectRepository(Survey) private readonly surveyRepo: Repository<Survey>,
    @InjectRepository(SurveyResponse) private readonly responseRepo: Repository<SurveyResponse>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async createSurvey(tenantId: string, createdById: string, dto: Partial<Survey>): Promise<Survey> {
    const questions = (dto.questions ?? []) as SurveyQuestion[];
    if (!questions.length) throw new BadRequestException('A survey needs at least one question');
    const withIds = questions.map(q => ({ ...q, id: q.id || randomUUID() }));
    const survey = this.surveyRepo.create({
      ...dto,
      questions: withIds,
      tenantId,
      createdById,
      status: SurveyStatus.DRAFT,
    });
    return this.surveyRepo.save(survey);
  }

  async listSurveys(tenantId: string, status?: SurveyStatus): Promise<Survey[]> {
    return this.surveyRepo.find({
      where: status ? { tenantId, status } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSurvey(tenantId: string, id: string): Promise<Survey> {
    const survey = await this.surveyRepo.findOne({ where: { id, tenantId } });
    if (!survey) throw new NotFoundException(`Survey ${id} not found`);
    return survey;
  }

  async activate(tenantId: string, id: string): Promise<Survey> {
    const survey = await this.getSurvey(tenantId, id);
    if (survey.status !== SurveyStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT surveys can be published (current: ${survey.status})`);
    }
    survey.status = SurveyStatus.ACTIVE;
    const saved = await this.surveyRepo.save(survey);
    await this.automation?.emit(tenantId, 'survey.published', {
      surveyId: saved.id, title: saved.title, type: saved.type,
    });
    return saved;
  }

  async close(tenantId: string, id: string): Promise<Survey> {
    const survey = await this.getSurvey(tenantId, id);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException(`Only ACTIVE surveys can be closed (current: ${survey.status})`);
    }
    survey.status = SurveyStatus.CLOSED;
    const saved = await this.surveyRepo.save(survey);
    await this.automation?.emit(tenantId, 'survey.closed', {
      surveyId: saved.id, title: saved.title, type: saved.type,
    });
    return saved;
  }

  /** Deterministic per-survey respondent hash: dedupes double submissions
   *  without storing identity on anonymous surveys. */
  private respondentKey(surveyId: string, userId: string): string {
    return createHash('sha256').update(`${surveyId}:${userId}`).digest('hex');
  }

  async submitResponse(
    tenantId: string, surveyId: string, userId: string, answers: Record<string, any>,
  ): Promise<{ submitted: boolean }> {
    const survey = await this.getSurvey(tenantId, surveyId);
    if (survey.status !== SurveyStatus.ACTIVE) {
      throw new BadRequestException('This survey is not accepting responses');
    }
    const missing = survey.questions.filter(q => q.required !== false)
      .filter(q => answers?.[q.id] === undefined || answers?.[q.id] === null || answers?.[q.id] === '');
    if (missing.length) {
      throw new BadRequestException(`Missing answers for: ${missing.map(q => q.text).join(', ')}`);
    }
    const key = this.respondentKey(surveyId, userId);
    const existing = await this.responseRepo.findOne({ where: { surveyId, respondentKey: key } });
    if (existing) throw new BadRequestException('You have already responded to this survey');
    const response = this.responseRepo.create({
      tenantId,
      surveyId,
      respondentKey: key,
      respondentUserId: survey.anonymous ? null : userId,
      answers,
    });
    await this.responseRepo.save(response);
    return { submitted: true };
  }

  async hasResponded(tenantId: string, surveyId: string, userId: string): Promise<boolean> {
    const key = this.respondentKey(surveyId, userId);
    return !!(await this.responseRepo.findOne({ where: { surveyId, respondentKey: key } }));
  }

  /** Per-question aggregates plus eNPS for 0–10 scale questions. */
  async results(tenantId: string, surveyId: string) {
    const survey = await this.getSurvey(tenantId, surveyId);
    const responses = await this.responseRepo.find({ where: { tenantId, surveyId } });
    const questions = survey.questions.map(q => {
      const values = responses.map(r => r.answers?.[q.id]).filter(v => v !== undefined && v !== null && v !== '');
      if (q.type === 'TEXT') {
        return { questionId: q.id, text: q.text, type: q.type, count: values.length, answers: values.map(String) };
      }
      if (q.type === 'YES_NO') {
        const yes = values.filter(v => v === true || v === 'true' || v === 'YES' || v === 'yes').length;
        return {
          questionId: q.id, text: q.text, type: q.type, count: values.length,
          yesPercent: values.length ? Math.round((yes / values.length) * 100) : 0,
        };
      }
      // RATING (1–5) and SCALE_10 (0–10)
      const nums = values.map(Number).filter(n => !Number.isNaN(n));
      const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
      const result: any = { questionId: q.id, text: q.text, type: q.type, count: nums.length, average: avg };
      if (q.type === 'SCALE_10') {
        const promoters = nums.filter(n => n >= 9).length;
        const detractors = nums.filter(n => n <= 6).length;
        result.enps = nums.length ? Math.round(((promoters - detractors) / nums.length) * 100) : 0;
      }
      return result;
    });
    return {
      surveyId, title: survey.title, type: survey.type, status: survey.status,
      anonymous: survey.anonymous, responseCount: responses.length, questions,
    };
  }
}
