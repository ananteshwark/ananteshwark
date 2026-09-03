import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { RecognitionService } from '../engagement/recognition.service';
import { SemanticService } from '../analytics/semantic/semantic.service';
import { AiAnomalyService } from '../ai/ai-anomaly.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AiSurveyService } from '../ai/survey/ai-survey.service';
import { LlmPlannerService } from './llm-planner.service';
import { HrCaseCategory } from '../helpdesk/entities/hr-case.entity';

export interface CopilotPlan {
  action: string;
  params: Record<string, any>;
}

export interface CopilotResult {
  understood: boolean;
  action?: string;
  params?: Record<string, any>;
  message: string;
  result?: any;
}

const DATASET_ALIASES: Record<string, string> = {
  expenses: 'expenses', 'expense claims': 'expenses', claims: 'expenses',
  'sales orders': 'sales_orders', orders: 'sales_orders', sales: 'sales_orders',
  invoices: 'ar_invoices', 'ar invoices': 'ar_invoices',
  'purchase orders': 'purchase_orders', pos: 'purchase_orders',
  employees: 'employees', headcount: 'employees',
  tickets: 'tickets', 'service tickets': 'tickets',
};

/**
 * Task-completing copilot: turns a natural-language command into a concrete
 * action against real services (raise an HR case, give recognition, run an
 * analytics query), or falls back to the Q&A assistant.
 *
 * Planning is hybrid: the deterministic regex `plan()` runs first (free,
 * predictable), and when it misses, the optional LLM planner (Claude tool-use
 * emitting the same {action, params} shape — see LlmPlannerService) handles
 * the long tail of phrasings. Executors are planner-agnostic.
 */
@Injectable()
export class CopilotService {
  constructor(
    @Optional() @InjectRepository(Employee) private readonly employeeRepo?: Repository<Employee>,
    @Optional() private readonly helpdesk?: HelpdeskService,
    @Optional() private readonly recognition?: RecognitionService,
    @Optional() private readonly semantic?: SemanticService,
    @Optional() private readonly anomalies?: AiAnomalyService,
    @Optional() private readonly llmPlanner?: LlmPlannerService,
    @Optional() private readonly knowledge?: KnowledgeService,
    @Optional() private readonly survey?: AiSurveyService,
  ) {}

  /** Registry of what the copilot can do — surfaced to the UI as suggestions. */
  capabilities() {
    return [
      { action: 'raise_hr_case', example: 'Raise an HR case about my March payslip missing' },
      { action: 'give_recognition', example: 'Recognize Asha Rao for closing the audit early' },
      { action: 'run_query', example: 'Show expenses by status' },
      { action: 'find_anomalies', example: 'Any anomalies this week?' },
      { action: 'search_knowledge', example: 'How do I reset my payroll password?' },
      { action: 'survey_sentiment', example: 'Analyze the sentiment of "the team feels burned out"' },
    ];
  }

  plan(message: string): CopilotPlan | null {
    const text = (message ?? '').trim();

    // give_recognition: "recognize/appreciate/kudos to NAME for MESSAGE"
    const recognitionMatch = text.match(
      /(?:recogni[sz]e|appreciate|kudos to|give kudos to)\s+([A-Za-z][A-Za-z .'-]*?)\s+for\s+(.+)/i,
    );
    if (recognitionMatch) {
      return {
        action: 'give_recognition',
        params: { name: recognitionMatch[1].trim(), message: recognitionMatch[2].trim() },
      };
    }

    // raise_hr_case: "raise/open/file an hr case/ticket/complaint/grievance about SUBJECT"
    const caseMatch = text.match(
      /(?:raise|open|file|create|log)\s+(?:an?\s+)?(?:hr\s+)?(case|ticket|complaint|grievance|issue)\s*(?:about|for|regarding|:)?\s*(.+)/i,
    );
    if (caseMatch) {
      const kind = caseMatch[1].toLowerCase();
      return {
        action: 'raise_hr_case',
        params: {
          subject: caseMatch[2].trim(),
          category: kind === 'grievance' || kind === 'complaint' ? HrCaseCategory.GRIEVANCE : HrCaseCategory.OTHER,
        },
      };
    }

    // find_anomalies: "any anomalies (this week)?", "show anomalies in finance", "find outliers"
    const anomalyMatch = text.match(
      /(?:any|show|list|find|detect|scan for)\s+(?:me\s+)?(?:recent\s+)?(?:anomalies|outliers|irregularities|suspicious activity)(?:\s+in\s+([a-z]+))?/i,
    );
    if (anomalyMatch) {
      return {
        action: 'find_anomalies',
        params: { module: anomalyMatch[1]?.trim().toLowerCase() ?? null },
      };
    }

    // survey_sentiment: analyze/what is the sentiment of "TEXT"
    const sentimentMatch = text.match(
      /(?:analy[sz]e|what(?:'s| is) the|check|score)\s+(?:the\s+)?sentiment\s+(?:of|for)\s+["“]?(.+?)["”]?$/i,
    );
    if (sentimentMatch) {
      return { action: 'survey_sentiment', params: { text: sentimentMatch[1].trim() } };
    }

    // search_knowledge: "how do I ...", "search the knowledge base for ...", "kb article about ..."
    const kbMatch = text.match(
      /(?:^how do i\s+(.+)|(?:search|look up|find)\s+(?:the\s+)?(?:knowledge base|kb|help(?:\s*center)?|articles?)\s+(?:for|about|on)?\s*(.+)|(?:kb|knowledge)\s+article\s+(?:about|on|for)\s+(.+))/i,
    );
    if (kbMatch) {
      const query = (kbMatch[1] ?? kbMatch[2] ?? kbMatch[3] ?? '').trim().replace(/\?$/, '');
      if (query) return { action: 'search_knowledge', params: { query } };
    }

    // run_query: "show/list/count DATASET [by DIMENSION]"
    const queryMatch = text.match(
      /(?:show|list|count|how many)\s+(?:me\s+)?([a-z ]+?)(?:\s+by\s+([a-z_ ]+))?\s*$/i,
    );
    if (queryMatch) {
      const dataset = DATASET_ALIASES[queryMatch[1].trim().toLowerCase()];
      if (dataset) {
        return {
          action: 'run_query',
          params: { dataset, dimension: queryMatch[2]?.trim().toLowerCase() ?? null },
        };
      }
    }

    return null;
  }

  async execute(
    tenantId: string,
    user: { id: string; name: string },
    message: string,
  ): Promise<CopilotResult> {
    const plan = this.plan(message) ?? (await this.llmPlanner?.plan(message)) ?? null;
    if (!plan) {
      return {
        understood: false,
        message:
          'I could not map that to an action. Try: ' +
          this.capabilities().map((c) => `"${c.example}"`).join(' · '),
      };
    }

    switch (plan.action) {
      case 'raise_hr_case': {
        if (!this.helpdesk) return this.unavailable(plan, 'HR helpdesk');
        const hrCase = await this.helpdesk.createCase(tenantId, user.id, {
          subject: plan.params.subject,
          description: `Raised via assistant: "${message}"`,
          category: plan.params.category,
        });
        return {
          understood: true,
          action: plan.action,
          params: plan.params,
          result: { caseId: hrCase.id, caseNumber: hrCase.caseNumber },
          message: `Done — HR case ${hrCase.caseNumber} raised: "${hrCase.subject}". The HR team has been queued.`,
        };
      }

      case 'give_recognition': {
        if (!this.recognition || !this.employeeRepo) return this.unavailable(plan, 'recognition');
        const employee = await this.findEmployeeByName(tenantId, plan.params.name);
        if (!employee) {
          return {
            understood: true,
            action: plan.action,
            params: plan.params,
            message: `I couldn't find an employee named "${plan.params.name}". Try their full name as it appears in HR.`,
          };
        }
        const badges = await this.recognition.listBadges(tenantId, true);
        if (!badges.length) {
          return {
            understood: true,
            action: plan.action,
            params: plan.params,
            message: 'No active recognition badges are configured yet — add one on the Recognition page first.',
          };
        }
        const toName = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
        const saved = await this.recognition.give(tenantId, { userId: user.id, name: user.name }, {
          badgeId: badges[0].id,
          toEmployeeId: employee.id,
          toName,
          message: plan.params.message,
        });
        return {
          understood: true,
          action: plan.action,
          params: plan.params,
          result: { recognitionId: saved.id, badge: saved.badgeName },
          message: `🎉 Recognized ${toName} with "${saved.badgeName}" — it's on the recognition wall.`,
        };
      }

      case 'run_query': {
        if (!this.semantic) return this.unavailable(plan, 'analytics');
        const dataset = plan.params.dataset;
        const datasets = this.semantic.listDatasets();
        const def = datasets.find((d) => d.key === dataset);
        if (!def) {
          return {
            understood: true,
            action: plan.action,
            params: plan.params,
            message: `I don't have a dataset called "${dataset}" — try one of: ${datasets.map((d) => d.key).join(', ')}.`,
          };
        }
        const dimension = plan.params.dimension && def.dimensions.some((d: any) => d.key === plan.params.dimension)
          ? plan.params.dimension
          : plan.params.dimension === 'month' && def.hasDateColumn
            ? 'month'
            : null;
        const { rows } = await this.semantic.run(tenantId, {
          dataset,
          dimensions: dimension ? [dimension] : [],
          measures: ['count'],
        });
        return {
          understood: true,
          action: plan.action,
          params: { dataset, dimension },
          result: { rows },
          message: dimension
            ? `Here is ${def.label.toLowerCase()} by ${dimension}:`
            : `Total ${def.label.toLowerCase()}: ${rows[0]?.count ?? 0}.`,
        };
      }

      case 'find_anomalies': {
        if (!this.anomalies) return this.unavailable(plan, 'AI anomaly');
        const module = plan.params.module;
        const scan = await this.anomalies.scan(tenantId, module ? [module] : undefined);
        if (!scan.findings.length) {
          return {
            understood: true,
            action: plan.action,
            params: plan.params,
            result: { totalFindings: 0 },
            message: module
              ? `Good news — no anomalies detected in ${module}.`
              : 'Good news — no anomalies detected across the scanned modules.',
          };
        }
        const high = scan.findings.filter((f) => f.severity === 'HIGH').length;
        const top = scan.findings.slice(0, 3).map((f) => `${f.severity} [${f.module}] ${f.title}`);
        return {
          understood: true,
          action: plan.action,
          params: plan.params,
          result: { totalFindings: scan.findings.length, highSeverity: high, findings: scan.findings.slice(0, 10) },
          message:
            `Found ${scan.findings.length} anomal${scan.findings.length === 1 ? 'y' : 'ies'}` +
            (high ? ` (${high} high severity)` : '') +
            (module ? ` in ${module}` : '') +
            `. Top: ${top.join(' · ')}. Full detail is on the AI Anomalies page.`,
        };
      }

      case 'search_knowledge': {
        if (!this.knowledge) return this.unavailable(plan, 'knowledge base');
        const results = await this.knowledge.search(tenantId, plan.params.query, 5);
        if (!results.length) {
          return {
            understood: true, action: plan.action, params: plan.params,
            result: { articles: [] },
            message: `I couldn't find a knowledge-base article for "${plan.params.query}". You could raise an HR case instead.`,
          };
        }
        const top = results.slice(0, 3).map((r) => r.article.title);
        return {
          understood: true, action: plan.action, params: plan.params,
          result: { articles: results.map((r) => ({ id: r.article.id, title: r.article.title, score: r.score })) },
          message: `Top knowledge-base matches for "${plan.params.query}": ${top.join(' · ')}.`,
        };
      }

      case 'survey_sentiment': {
        if (!this.survey) return this.unavailable(plan, 'survey analytics');
        const s = AiSurveyService.scoreSentiment(plan.params.text);
        return {
          understood: true, action: plan.action, params: plan.params,
          result: s,
          message: `Sentiment: ${s.label} (score ${s.score}, ${s.positives} positive / ${s.negatives} negative signals).`,
        };
      }

      default:
        return { understood: false, message: 'Unknown action.' };
    }
  }

  private unavailable(plan: CopilotPlan, what: string): CopilotResult {
    return {
      understood: true,
      action: plan.action,
      params: plan.params,
      message: `I understood the request, but the ${what} module is not available in this deployment.`,
    };
  }

  private async findEmployeeByName(tenantId: string, name: string): Promise<Employee | null> {
    const parts = name.trim().split(/\s+/);
    // Try first+last, then first name only.
    if (parts.length >= 2) {
      const hit = await this.employeeRepo!.findOne({
        where: { tenantId, firstName: ILike(parts[0]), lastName: ILike(parts.slice(1).join(' ')) } as any,
      });
      if (hit) return hit;
    }
    return this.employeeRepo!.findOne({ where: { tenantId, firstName: ILike(parts[0]) } as any });
  }
}
