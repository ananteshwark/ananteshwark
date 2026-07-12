import { ConfigSyncService } from './config-sync.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ConfigSyncService', () => {
  let service: ConfigSyncService;
  let snapRepo: any;

  beforeEach(() => { snapRepo = mockRepo(); service = new ConfigSyncService(snapRepo); });

  describe('checksum', () => {
    it('is stable regardless of key order', () => {
      expect(ConfigSyncService.checksum({ a: 1, b: 2 })).toBe(ConfigSyncService.checksum({ b: 2, a: 1 }));
      expect(ConfigSyncService.checksum({ a: 1 })).not.toBe(ConfigSyncService.checksum({ a: 2 }));
    });
  });

  describe('diff (pure)', () => {
    it('reports added, removed, changed and unchanged keys', () => {
      const d = ConfigSyncService.diff(
        { keep: 1, drop: 2, change: 'old' },
        { keep: 1, change: 'new', add: 9 },
      );
      expect(d.added).toEqual([{ key: 'add', value: 9 }]);
      expect(d.removed).toEqual([{ key: 'drop', value: 2 }]);
      expect(d.changed).toEqual([{ key: 'change', from: 'old', to: 'new' }]);
      expect(d.unchanged).toBe(1);
    });
  });

  describe('promote (pure)', () => {
    it('promotes only the selected keys onto the base', () => {
      const { merged, applied } = ConfigSyncService.promote(
        { a: 1, b: 2 },
        { a: 10, b: 20, c: 30 },
        ['a', 'c'],
      );
      expect(merged).toEqual({ a: 10, b: 2, c: 30 });
      expect(applied).toEqual(['a', 'c']);
    });

    it('promotes all snapshot keys when none are specified', () => {
      const { applied } = ConfigSyncService.promote({}, { x: 1, y: 2 });
      expect(applied.sort()).toEqual(['x', 'y']);
    });
  });

  it('captures a snapshot with a checksum', async () => {
    const snap = await service.capture('t1', { name: 'baseline', environment: 'PROD', payload: { 'leave.cap': 30 } });
    expect(snap.checksum).toBe(ConfigSyncService.checksum({ 'leave.cap': 30 }));
  });
});
