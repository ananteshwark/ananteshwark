import { BadRequestException } from '@nestjs/common';
import { JourneysService } from './journeys.service';
import { JourneyTrigger, JourneyStatus, JourneyStepStatus } from './entities/journey.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => (Array.isArray(x) ? x.map((y) => ({ id: 'gen', ...y })) : { id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x.map((y, i) => ({ id: `s${i}`, ...y })) : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('JourneysService', () => {
  let service: JourneysService;
  let templateRepo: any, instanceRepo: any, stepRepo: any, automation: any;

  beforeEach(() => {
    templateRepo = mockRepo(); instanceRepo = mockRepo(); stepRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new JourneysService(templateRepo, instanceRepo, stepRepo, automation);
  });

  it('normalises steps and drops those missing key/title', async () => {
    const tpl = await service.createTemplate('t1', {
      name: 'Onboarding', triggerEvent: JourneyTrigger.ONBOARDING,
      steps: [{ key: 'it', title: 'Laptop', offsetDays: -2 }, { key: '', title: 'x' }, { key: 'hr', title: '' }],
    });
    expect(tpl.steps).toHaveLength(1);
    expect(tpl.steps[0]).toMatchObject({ key: 'it', offsetDays: -2, mandatory: true });
  });

  it('instantiates a journey computing due dates from the anchor and emits journey.started', async () => {
    templateRepo.findOne.mockResolvedValue({
      id: 'tpl1', tenantId: 't1', name: 'Onboarding', triggerEvent: JourneyTrigger.ONBOARDING,
      steps: [{ key: 'it', title: 'Laptop', offsetDays: -2, mandatory: true }, { key: 'welcome', title: 'Welcome', offsetDays: 1, mandatory: true }],
    });
    const { instance, steps } = await service.triggerTemplate('t1', 'tpl1', { employeeId: 'e1', employeeName: 'Ann', anchorDate: '2026-03-10' });
    expect(instance.status).toBe(JourneyStatus.ACTIVE);
    expect(steps.map((s) => s.dueDate)).toEqual(['2026-03-08', '2026-03-11']);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'journey.started', expect.objectContaining({ steps: 2 }));
  });

  it('fires all active templates for an event', async () => {
    templateRepo.find.mockResolvedValue([
      { id: 'a', tenantId: 't1', name: 'A', triggerEvent: JourneyTrigger.PROMOTION, steps: [] },
      { id: 'b', tenantId: 't1', name: 'B', triggerEvent: JourneyTrigger.PROMOTION, steps: [] },
    ]);
    const results = await service.triggerByEvent('t1', JourneyTrigger.PROMOTION, { employeeId: 'e1', employeeName: 'Ann', anchorDate: '2026-03-10' });
    expect(results).toHaveLength(2);
  });

  it('auto-completes the instance when all mandatory steps are done', async () => {
    stepRepo.findOne.mockResolvedValue({ id: 'st1', tenantId: 't1', instanceId: 'i1', mandatory: true, status: JourneyStepStatus.PENDING });
    instanceRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', status: JourneyStatus.ACTIVE, employeeId: 'e1', triggerEvent: JourneyTrigger.ONBOARDING });
    stepRepo.find.mockResolvedValue([{ id: 'st1', mandatory: true, status: JourneyStepStatus.DONE }]);
    await service.completeStep('t1', 'st1', 'u1');
    expect(instanceRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: JourneyStatus.COMPLETED }));
    expect(automation.emit).toHaveBeenCalledWith('t1', 'journey.completed', expect.objectContaining({ instanceId: 'i1' }));
  });

  it('does not complete while a mandatory step is still pending', async () => {
    stepRepo.findOne.mockResolvedValue({ id: 'st1', tenantId: 't1', instanceId: 'i1', mandatory: false, status: JourneyStepStatus.PENDING });
    instanceRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', status: JourneyStatus.ACTIVE });
    stepRepo.find.mockResolvedValue([{ id: 'st1', mandatory: false, status: JourneyStepStatus.SKIPPED }, { id: 'st2', mandatory: true, status: JourneyStepStatus.PENDING }]);
    await service.skipStep('t1', 'st1');
    expect(instanceRepo.save).not.toHaveBeenCalled();
  });

  it('refuses to skip a mandatory step', async () => {
    stepRepo.findOne.mockResolvedValue({ id: 'st1', tenantId: 't1', mandatory: true });
    await expect(service.skipStep('t1', 'st1')).rejects.toThrow(BadRequestException);
  });
});
