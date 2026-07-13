import { StarterKitService } from './starter-kit.service';
import { JourneyTrigger } from '../../hr/journeys/entities/journey.entity';

/**
 * Starter kit: a fresh tenant gets workable defaults across five modules;
 * seeding is idempotent per section and one failing section never blocks
 * the others.
 */
describe('StarterKitService', () => {
  let leave: any, recognition: any, letters: any, knowledge: any, journeys: any;
  let service: StarterKitService;

  beforeEach(() => {
    leave = { listLeaveTypes: jest.fn().mockResolvedValue([]), createLeaveType: jest.fn().mockResolvedValue({}) };
    recognition = { listBadges: jest.fn().mockResolvedValue([]), createBadge: jest.fn().mockResolvedValue({}) };
    letters = { listTemplates: jest.fn().mockResolvedValue([]), createTemplate: jest.fn().mockResolvedValue({}) };
    knowledge = { listCategories: jest.fn().mockResolvedValue([]), createCategory: jest.fn().mockResolvedValue({}) };
    journeys = { listTemplates: jest.fn().mockResolvedValue([]), createTemplate: jest.fn().mockResolvedValue({}) };
    service = new StarterKitService(leave, recognition, letters, knowledge, journeys);
  });

  it('seeds all five sections on a fresh tenant', async () => {
    const r = await service.seed('t1');
    expect(r).toEqual({ leaveTypes: 4, badges: 5, letterTemplates: 6, kbCategories: 4, journeyTemplates: 2 });
    expect(leave.createLeaveType).toHaveBeenCalledWith('t1', expect.objectContaining({ code: 'AL' }));
    expect(recognition.createBadge).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Team Player' }));
    expect(knowledge.createCategory).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'HR Policies' }));
  });

  it('seeds the MERIT_INCREMENT letter template the merit approval handoff generates from', async () => {
    await service.seed('t1');
    expect(letters.createTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ code: 'MERIT_INCREMENT' }));
  });

  it('seeds onboarding and offboarding journey templates tied to their trigger events', async () => {
    await service.seed('t1');
    expect(journeys.createTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ triggerEvent: JourneyTrigger.ONBOARDING }));
    expect(journeys.createTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ triggerEvent: JourneyTrigger.OFFBOARDING }));
  });

  it('is idempotent: sections with existing content are skipped', async () => {
    leave.listLeaveTypes.mockResolvedValue([{ id: 'lt1' }]);
    letters.listTemplates.mockResolvedValue([{ id: 't1' }]);
    const r = await service.seed('t1');
    expect(r.leaveTypes).toBe(0);
    expect(r.letterTemplates).toBe(0);
    expect(leave.createLeaveType).not.toHaveBeenCalled();
    expect(letters.createTemplate).not.toHaveBeenCalled();
    // Untouched sections still seed.
    expect(r.badges).toBe(5);
  });

  it('one failing section never blocks the others', async () => {
    recognition.listBadges.mockRejectedValue(new Error('engagement down'));
    const r = await service.seed('t1');
    expect(r.badges).toBe(0);
    expect(r.leaveTypes).toBe(4);
    expect(r.kbCategories).toBe(4);
  });

  it('degrades to a no-op when no feature modules are wired', async () => {
    const bare = new StarterKitService();
    await expect(bare.seed('t1')).resolves.toEqual({
      leaveTypes: 0, badges: 0, letterTemplates: 0, kbCategories: 0, journeyTemplates: 0,
    });
  });
});
