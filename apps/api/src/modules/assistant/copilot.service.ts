import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { RecognitionService } from '../engagement/recognition.service';
import { SemanticService } from '../analytics/semantic/semantic.service';
import { AiAnomalyService } from '../ai/ai-anomaly.service';
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
  ) {}

  /** Registry of what the copilot can do — surfaced to the UI as suggestions. */
  capabilities() {
    return [
      { action: 'raise_hr_case', example: 'Raise an HR case about my March payslip missing' },
      { action: 'give_recognition', example: 'Recognize Asha Rao for closing the audit early' },
      { action: 'run_query', example: 'Show expenses by status' },
      { action: 'find_anomalies', example: 'Any anomalies this week?' },
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
