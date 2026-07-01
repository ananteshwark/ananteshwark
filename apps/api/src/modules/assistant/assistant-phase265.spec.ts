import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssistantService } from './assistant.service';
import { ConversationTurn } from './entities/conversation-turn.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((x) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x)),
});

describe('AssistantService — Phase 265-268', () => {
  let service: AssistantService;
  let turnRepo: any;

  beforeEach(async () => {
    turnRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: getRepositoryToken(ConversationTurn), useValue: turnRepo },
      ],
    }).compile();
    service = module.get(AssistantService);
  });

  // ─── Ph-265: intent classification ────────────────────────────────

  it('classify — routes approval utterances to PENDING_APPROVALS', () => {
    const r = service.classify('What are my pending approvals?');
    expect(r.intent).toBe('PENDING_APPROVALS');
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('classify — routes leave utterances to LEAVE_BALANCE', () => {
    expect(service.classify("what's my leave balance").intent).toBe('LEAVE_BALANCE');
  });

  it('classify — unknown utterance yields UNKNOWN with zero confidence', () => {
    const r = service.classify('tell me a joke about penguins');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.confidence).toBe(0);
  });

  // ─── Ph-266: approval bot ─────────────────────────────────────────

  it('handle — approval bot offers approve-all with a count', async () => {
    const r = await service.handle('t1', 'u1', 'show my pending approvals', { pendingApprovals: 3 });
    expect(r.intent).toBe('PENDING_APPROVALS');
    expect(r.response).toContain('3 pending approvals');
    expect(r.action).toMatchObject({ type: 'APPROVE_ALL', count: 3 });
  });

  it('handle — approval bot with none pending', async () => {
    const r = await service.handle('t1', 'u1', 'any approvals waiting for me', { pendingApprovals: 0 });
    expect(r.action).toBeNull();
  });

  // ─── Ph-267: HR bot ───────────────────────────────────────────────

  it('handle — HR bot returns leave balance', async () => {
    const r = await service.handle('t1', 'u1', 'how much leave do I have', { leaveBalance: 12 });
    expect(r.response).toContain('12 days');
  });

  it('handle — HR bot payslip provides a download action', async () => {
    const r = await service.handle('t1', 'u1', 'download my payslip', { latestPayslipPeriod: '2026-06' });
    expect(r.action).toMatchObject({ type: 'DOWNLOAD_PAYSLIP', period: '2026-06' });
  });

  // ─── Ph-268: finance bot ──────────────────────────────────────────

  it('handle — finance bot narrates overdue AR', async () => {
    const r = await service.handle('t1', 'u1', 'show overdue invoices', { overdueArAmount: '₹50,000', overdueArCount: 4 });
    expect(r.response).toContain('4 overdue invoices');
    expect(r.response).toContain('₹50,000');
  });

  it('handle — finance bot returns cash position', async () => {
    const r = await service.handle('t1', 'u1', 'what is my cash position', { cashPosition: '₹1.2M' });
    expect(r.response).toContain('₹1.2M');
  });

  it('handle — logs the conversation turn', async () => {
    await service.handle('t1', 'u1', 'hello', {});
    expect(turnRepo.save).toHaveBeenCalled();
  });
});
