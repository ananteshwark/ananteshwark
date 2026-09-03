import { BadRequestException } from '@nestjs/common';
import { DeviceService, compareVersions } from './device.service';
import { FaceMatchAdapter } from './face-match.adapter';
import { VisitorStatus } from './entities/device.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('compareVersions', () => {
  it('compares dotted numeric versions', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
  });
});

describe('DeviceService', () => {
  let service: DeviceService;
  let faceRepo: any, configRepo: any, visitorRepo: any, faceMatch: FaceMatchAdapter, automation: any;

  beforeEach(() => {
    faceRepo = mockRepo(); configRepo = mockRepo(); visitorRepo = mockRepo();
    faceMatch = new FaceMatchAdapter();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new DeviceService(faceRepo, configRepo, visitorRepo, faceMatch, automation);
  });

  describe('facial check-in', () => {
    it('enrols a template ref (no raw biometric)', async () => {
      faceRepo.findOne.mockResolvedValue(null);
      const e = await service.enrollFace('t1', { employeeId: 'e1', templateRef: 'tmpl-abc' });
      expect(e).toMatchObject({ employeeId: 'e1', templateRef: 'tmpl-abc', active: true });
    });

    it('returns matched:false via the seam when not wired', async () => {
      faceRepo.find.mockResolvedValue([{ employeeId: 'e1', templateRef: 'tmpl-abc' }]);
      const res = await service.faceCheckIn('t1', 'probe-1');
      expect(res.matched).toBe(false);
      expect(res.reason).toMatch(/not wired/);
    });
  });

  describe('mobile config version gate', () => {
    it('forces an update below the min version', async () => {
      configRepo.findOne.mockResolvedValue({ tenantId: 't1', minVersion: '2.0.0', latestVersion: '2.3.0' });
      const res = await service.checkVersion('t1', '1.9.0');
      expect(res).toMatchObject({ supported: false, forceUpdate: true, updateAvailable: true });
    });

    it('supports a current client with an available update', async () => {
      configRepo.findOne.mockResolvedValue({ tenantId: 't1', minVersion: '2.0.0', latestVersion: '2.3.0' });
      const res = await service.checkVersion('t1', '2.1.0');
      expect(res).toMatchObject({ supported: true, forceUpdate: false, updateAvailable: true });
    });
  });

  describe('visitor kiosk', () => {
    it('check-in assigns a badge, stamps time, and notifies the host', async () => {
      visitorRepo.findOne.mockResolvedValue({ id: 'v1', tenantId: 't1', fullName: 'Guest', status: VisitorStatus.PRE_REGISTERED, hostEmployeeId: 'h1' });
      const v = await service.checkIn('t1', 'v1');
      expect(v.status).toBe(VisitorStatus.CHECKED_IN);
      expect(v.badgeNumber).toMatch(/^V-/);
      expect(v.checkedInAt).toBeInstanceOf(Date);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'visitor.checked_in', expect.objectContaining({ hostEmployeeId: 'h1' }));
    });

    it('cannot check out a visitor who never checked in', async () => {
      visitorRepo.findOne.mockResolvedValue({ id: 'v1', tenantId: 't1', status: VisitorStatus.PRE_REGISTERED });
      await expect(service.checkOut('t1', 'v1')).rejects.toThrow(BadRequestException);
    });

    it('no-show sweep flips overdue pre-registrations', async () => {
      visitorRepo.find.mockResolvedValue([
        { id: 'a', status: VisitorStatus.PRE_REGISTERED, expectedAt: new Date('2026-07-01T09:00:00Z') },
        { id: 'b', status: VisitorStatus.PRE_REGISTERED, expectedAt: new Date('2026-07-20T09:00:00Z') }, // future
        { id: 'c', status: VisitorStatus.PRE_REGISTERED, expectedAt: null },
      ]);
      const res = await service.noShowSweep('t1', new Date('2026-07-11T00:00:00Z'));
      expect(res.noShows).toBe(1);
    });
  });
});
