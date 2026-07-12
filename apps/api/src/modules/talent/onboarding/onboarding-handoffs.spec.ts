import { OnboardingService } from './onboarding.service';
import { JourneyTrigger } from '../../hr/journeys/entities/journey.entity';

/** Old→new handoff: creating an onboarding plan fires ONBOARDING journeys. */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue(undefined),
});

describe('OnboardingService — journeys handoff', () => {
  let service: OnboardingService;
  let templateRepo: any, planRepo: any, taskRepo: any, employeeRepo: any, journeys: any;

  beforeEach(() => {
    templateRepo = mockRepo(); planRepo = mockRepo(); taskRepo = mockRepo(); employeeRepo = mockRepo();
    journeys = { triggerByEvent: jest.fn().mockResolvedValue([]) };
    service = new OnboardingService(templateRepo, planRepo, taskRepo, employeeRepo, journeys);
  });

  it('fires ONBOARDING journeys anchored on the start date, with the employee name resolved', async () => {
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', firstName: 'New', lastName: 'Hire' });
    await service.createPlan('t1', { employeeId: 'e1', startDate: '2026-09-01' } as any);
    expect(journeys.triggerByEvent).toHaveBeenCalledWith('t1', JourneyTrigger.ONBOARDING, {
      employeeId: 'e1', employeeName: 'New Hire', anchorDate: '2026-09-01',
    });
  });

  it('falls back to the employee id when the lookup misses, and a journey failure never blocks the plan', async () => {
    employeeRepo.findOne.mockResolvedValue(null);
    journeys.triggerByEvent.mockRejectedValue(new Error('journeys down'));
    const plan = await service.createPlan('t1', { employeeId: 'e1', startDate: '2026-09-01' } as any);
    expect(plan).toBeDefined();
    expect(journeys.triggerByEvent).toHaveBeenCalledWith('t1', JourneyTrigger.ONBOARDING, expect.objectContaining({ employeeName: 'e1' }));
  });
});
