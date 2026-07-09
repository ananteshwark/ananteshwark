import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { CopilotPlan } from './copilot.service';

export const COPILOT_LLM_CLIENT = 'COPILOT_LLM_CLIENT';

const PLANNER_SYSTEM = `You are the intent planner for an ERP copilot. Map the user's message to
exactly one of the available action tools. Only pick an action the message clearly asks for; if the
message is a general question, small talk, or does not map to any tool, respond with a short text
message instead of calling a tool. Never invent parameter values the user did not provide.`;

/**
 * One strict tool per copilot action — Claude's tool call IS the plan, so the
 * planner returns the same {action, params} shape as the regex planner and no
 * executor changes are needed.
 */
const PLANNER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  {
    name: 'give_recognition',
    description:
      'Publicly recognize/appreciate an employee. Call when the user wants to thank, recognize, or give kudos to a named colleague.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "The employee's name as mentioned by the user" },
        message: { type: 'string', description: 'What they are being recognized for' },
      },
      required: ['name', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'raise_hr_case',
    description:
      'Open an HR helpdesk case. Call when the user reports an HR problem or asks to raise a case, ticket, complaint, or grievance.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Short subject line for the case' },
        category: {
          type: 'string',
          enum: ['PAYROLL', 'LEAVE', 'ATTENDANCE', 'BENEFITS', 'POLICY', 'DOCUMENTS', 'GRIEVANCE', 'IT', 'OTHER'],
          description: 'Best-fit category; use OTHER when unsure',
        },
      },
      required: ['subject', 'category'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_query',
    description:
      'Run an analytics count query over a business dataset, optionally grouped by a dimension. Call for questions like "how many X" or "show X by Y".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        dataset: {
          type: 'string',
          enum: ['expenses', 'sales_orders', 'ar_invoices', 'purchase_orders', 'employees', 'tickets'],
        },
        dimension: {
          type: ['string', 'null'],
          description: 'Grouping dimension such as status or month; null for a plain total',
        },
      },
      required: ['dataset', 'dimension'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_anomalies',
    description:
      'Run the AI anomaly scan across business modules. Call when the user asks about anomalies, outliers, irregularities, or suspicious activity.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        module: {
          type: ['string', 'null'],
          enum: ['expenses', 'procurement', 'sales', 'finance', 'payroll', 'crm', null],
          description: 'Restrict the scan to one module, or null for all modules',
        },
      },
      required: ['module'],
      additionalProperties: false,
    },
  },
];

const KNOWN_ACTIONS = new Set(PLANNER_TOOLS.map((t) => (t as any).name));

/**
 * LLM-backed planner behind the copilot's plan() seam. The regex planner
 * stays first (deterministic, zero-cost); this service handles the long tail
 * of phrasings it misses by asking Claude to emit the same {action, params}
 * shape via tool use. Enabled only when ANTHROPIC_API_KEY is configured —
 * without it the copilot behaves exactly as before.
 */
@Injectable()
export class LlmPlannerService {
  private readonly logger = new Logger(LlmPlannerService.name);
  private readonly client: Anthropic | null;

  constructor(@Optional() @Inject(COPILOT_LLM_CLIENT) client?: Anthropic) {
    this.client =
      client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 1, timeout: 30_000 }) : null);
  }

  get enabled(): boolean {
    return !!this.client;
  }

  async plan(message: string): Promise<CopilotPlan | null> {
    if (!this.client || !message?.trim()) return null;
    try {
      const response = await this.client.messages.create({
        model: process.env.COPILOT_PLANNER_MODEL ?? 'claude-opus-4-8',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: PLANNER_SYSTEM,
        tools: PLANNER_TOOLS,
        messages: [{ role: 'user', content: message }],
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (response.stop_reason === 'refusal') return null;
      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (!toolUse || !KNOWN_ACTIONS.has(toolUse.name)) return null;
      return { action: toolUse.name, params: (toolUse.input as Record<string, any>) ?? {} };
    } catch (e: any) {
      // The planner is best-effort — a failed call degrades to "not understood",
      // never to a broken copilot.
      this.logger.warn(`LLM planning failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
