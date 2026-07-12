import { ExitService } from './exit.service';
import { ExitStatus, ExitReason } from './entities/exit-request.entity';
import { JourneyTrigger } from '../journeys/entities/journey.entity';

/**
 * Old→new handoffs on the exit lifecycle: initiating an exit fires
 * OFFBOARDING journeys; completing one invites the employee into the alumni
 * network. Both are best-effort and never block the exit itself.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ExitService — handoffs', () => {
  let service: ExitService;
  let exitRepo: any, checklistRepo: any, fnfRepo: any, employeeRepo: any, automation: any, journeys: any, alumni: any;

  const emp = {
    id: 'e1', tenantId: 't1', firstName: 'Ann', lastName: 'Lee',
    employeeCode: 'E001', dateOfJoining: '2020-01-15', personalEmail: 'ann@home.com',
  };

  beforeEach(() => {
    exitRepo = mockRepo(); checklistRepo = mockRepo(); fnfRepo = mockRepo(); employeeRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    journeys = { triggerByEvent: jest.fn().mockResolvedValue([]) };
    alumni = { invite: jest.fn().mockResolvedValue({ id: 'al1' }) };
    service = new ExitService(exitRepo, checklistRepo, fnfRepo, employeeRepo, automation, journeys, alumni);
    employeeRepo.findOne.mockResolvedValue(emp);
  });

  it('fires OFFBOARDING journeys when an exit is initiated', async () => {
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31' });
    await service.create('t1', { employeeId: 'e1', lastWorkingDate: '2026-08-31' });
    expect(journeys.triggerByEvent).toHaveBeenCalledWith('t1', JourneyTrigger.OFFBOARDING, {
      employeeId: 'e1', employeeName: 'Ann Lee', anchorDate: '2026-08-31',
    });
  });

  it('a journey failure never blocks exit creation', async () => {
    journeys.triggerByEvent.mockRejectedValue(new Error('journeys down'));
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31' });
    await expect(service.create('t1', { employeeId: 'e1', lastWorkingDate: '2026-08-31' })).resolves.toBeDefined();
  });

  it('invites the employee into the alumni network when the exit completes', async () => {
    exitRepo.findOne.mockResolvedValue({
      id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31',
      reason: ExitReason.RESIGNATION, rehireEligible: true, status: ExitStatus.IN_CLEARANCE,
    });
    await service.update('t1', 'x1', { status: ExitStatus.COMPLETED });
    expect(alumni.invite).toHaveBeenCalledWith('t1', expect.objectContaining({
      employeeId: 'e1', fullName: 'Ann Lee', exitDate: '2026-08-31',
      personalEmail: 'ann@home.com', rehireEligible: true,
      tenureMonths: expect.any(Number),
    }));
    // ~6.6 years of tenure
    expect(alumni.invite.mock.calls[0][1].tenureMonths).toBeGreaterThan(75);
  });

  it('does not invite alumni on non-terminal status changes', async () => {
    exitRepo.findOne.mockResolvedValue({ id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31', status: ExitStatus.INITIATED });
    await service.update('t1', 'x1', { status: ExitStatus.IN_CLEARANCE });
    expect(alumni.invite).not.toHaveBeenCalled();
  });

  it('a duplicate alumni profile never blocks exit completion', async () => {
    alumni.invite.mockRejectedValue(new Error('already exists'));
    exitRepo.findOne.mockResolvedValue({
      id: 'x1', tenantId: 't1', employeeId: 'e1', lastWorkingDate: '2026-08-31',
      reason: ExitReason.RESIGNATION, status: ExitStatus.IN_CLEARANCE,
    });
    await expect(service.update('t1', 'x1', { status: ExitStatus.COMPLETED })).resolves.toBeDefined();
  });
});
