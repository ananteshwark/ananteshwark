import { LlmPlannerService } from './llm-planner.service';
import { CopilotService } from './copilot.service';

const toolUseResponse = (name: string, input: any) => ({
  stop_reason: 'tool_use',
  content: [
    { type: 'text', text: 'Mapping to an action.' },
    { type: 'tool_use', id: 'toolu_1', name, input },
  ],
});

describe('LlmPlannerService', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('is disabled without an API key and returns null plans', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const planner = new LlmPlannerService();
    expect(planner.enabled).toBe(false);
    expect(await planner.plan('recognize someone')).toBeNull();
  });

  it("translates Claude's tool call into the copilot plan shape", async () => {
    const client: any = {
      messages: {
        create: jest.fn().mockResolvedValue(
          toolUseResponse('give_recognition', { name: 'Asha Rao', message: 'the audit' }),
        ),
      },
    };
    const planner = new LlmPlannerService(client);
    const plan = await planner.plan('I want to publicly thank Asha Rao — she saved the audit');
    expect(plan).toEqual({
      action: 'give_recognition',
      params: { name: 'Asha Rao', message: 'the audit' },
    });
    const request = client.messages.create.mock.calls[0][0];
    expect(request.model).toBe('claude-opus-4-8');
    expect(request.tools.map((t: any) => t.name)).toEqual([
      'give_recognition', 'raise_hr_case', 'run_query', 'find_anomalies', 'search_knowledge', 'survey_sentiment',
    ]);
    expect(request.tools.every((t: any) => t.strict === true)).toBe(true);
  });

  it('returns null on text-only answers, unknown tools, refusals, and API errors', async () => {
    const cases = [
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Just chatting.' }] },
      toolUseResponse('made_up_action', {}),
      { stop_reason: 'refusal', content: [] },
    ];
    for (const response of cases) {
      const planner = new LlmPlannerService({
        messages: { create: jest.fn().mockResolvedValue(response) },
      } as any);
      expect(await planner.plan('hello there')).toBeNull();
    }
    const failing = new LlmPlannerService({
      messages: { create: jest.fn().mockRejectedValue(new Error('overloaded')) },
    } as any);
    expect(await failing.plan('any anomalies?')).toBeNull();
  });
});

describe('CopilotService — LLM planner fallback', () => {
  const user = { id: 'u1', name: 'Priya Admin' };

  it('consults the LLM planner only when the regex planner misses', async () => {
    const helpdesk: any = {
      createCase: jest.fn().mockResolvedValue({ id: 'c1', caseNumber: 'HRC-000011', subject: 'Payslip missing' }),
    };
    const llmPlanner: any = {
      plan: jest.fn().mockResolvedValue({
        action: 'raise_hr_case',
        params: { subject: 'Payslip missing', category: 'PAYROLL' },
      }),
    };
    const copilot = new CopilotService(undefined, helpdesk, undefined, undefined, undefined, llmPlanner);

    // Regex miss → LLM plans → real executor runs.
    const result = await copilot.execute('t1', user, "my payslip for June never showed up, can someone look into it");
    expect(llmPlanner.plan).toHaveBeenCalled();
    expect(helpdesk.createCase).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({ category: 'PAYROLL' }));
    expect(result.understood).toBe(true);
    expect(result.message).toContain('HRC-000011');

    // Regex hit → LLM never consulted.
    llmPlanner.plan.mockClear();
    await copilot.execute('t1', user, 'raise an hr case about parking');
    expect(llmPlanner.plan).not.toHaveBeenCalled();
  });

  it('falls back to capability examples when both planners miss', async () => {
    const llmPlanner: any = { plan: jest.fn().mockResolvedValue(null) };
    const copilot = new CopilotService(undefined, undefined, undefined, undefined, undefined, llmPlanner);
    const result = await copilot.execute('t1', user, 'what is the meaning of life');
    expect(result.understood).toBe(false);
    expect(result.message).toContain('Recognize Asha Rao');
  });
});
