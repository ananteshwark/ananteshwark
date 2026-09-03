import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PicklistService } from './picklist.service';
import { PICKLIST_DEFAULTS } from './picklist-defaults';

/**
 * Picklists (Dropdown Options): idempotent default seeding, duplicate-key
 * guard, system-picklist delete protection, resolve returning only active
 * options in order, and option reordering.
 */
describe('PicklistService', () => {
  let service: PicklistService;
  let picklists: any, options: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    picklists = mockRepo(); options = mockRepo();
    service = new PicklistService(picklists, options);
  });

  it('list seeds every default picklist for a fresh tenant, once', async () => {
    picklists.find
      .mockResolvedValueOnce([]) // seed check: nothing yet
      .mockResolvedValueOnce([]); // list read
    await service.list('t1');
    expect(picklists.save).toHaveBeenCalledTimes(PICKLIST_DEFAULTS.length);
    expect(picklists.create).toHaveBeenCalledWith(expect.objectContaining({ isSystem: true }));

    // already-seeded tenant: no re-creation
    picklists.save.mockClear();
    const seeded = PICKLIST_DEFAULTS.map((d) => ({ module: d.module, key: d.key }));
    picklists.find.mockResolvedValueOnce(seeded).mockResolvedValueOnce([]);
    await service.list('t1');
    expect(picklists.save).not.toHaveBeenCalled();
  });

  it('resolve returns only active options sorted by sortOrder', async () => {
    const seeded = PICKLIST_DEFAULTS.map((d) => ({ module: d.module, key: d.key }));
    picklists.find.mockResolvedValue(seeded);
    picklists.findOne.mockResolvedValue({
      id: 'p1', key: 'employmentType',
      options: [
        { value: 'b', active: true, sortOrder: 1 },
        { value: 'x', active: false, sortOrder: 0 },
        { value: 'a', active: true, sortOrder: 0 },
      ],
    });
    const opts = await service.resolve('t1', 'employmentType');
    expect(opts.map((o: any) => o.value)).toEqual(['a', 'b']);
  });

  it('createPicklist rejects duplicates and missing fields', async () => {
    await expect(service.createPicklist('t1', { module: '', key: 'k', label: 'L' })).rejects.toThrow(BadRequestException);

    picklists.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createPicklist('t1', { module: 'hr', key: 'dupe', label: 'L' })).rejects.toThrow('already exists');
  });

  it('system picklists cannot be deleted', async () => {
    picklists.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', isSystem: true });
    await expect(service.deletePicklist('t1', 'p1')).rejects.toThrow(BadRequestException);
    expect(picklists.remove).not.toHaveBeenCalled();

    picklists.findOne.mockResolvedValue({ id: 'p2', tenantId: 't1', isSystem: false });
    await service.deletePicklist('t1', 'p2');
    expect(picklists.remove).toHaveBeenCalled();
  });

  it('addOption appends at the end of the sort order', async () => {
    picklists.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    options.count.mockResolvedValue(3);
    await service.addOption('t1', 'p1', { value: 'new', label: 'New' });
    expect(options.create).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 3, active: true }));
  });

  it('reorder writes sequential sortOrder scoped to tenant + picklist', async () => {
    picklists.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    await service.reorder('t1', 'p1', ['o2', 'o1']);
    expect(options.update).toHaveBeenCalledWith({ id: 'o2', tenantId: 't1', picklistId: 'p1' }, { sortOrder: 0 });
    expect(options.update).toHaveBeenCalledWith({ id: 'o1', tenantId: 't1', picklistId: 'p1' }, { sortOrder: 1 });
  });

  it('option mutations are tenant-scoped 404s', async () => {
    await expect(service.updateOption('t2', 'x', {})).rejects.toThrow(NotFoundException);
    expect(options.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
