import { ConflictException } from '@nestjs/common';
import { assertVersion } from './optimistic-lock';
import { EmployeeService } from '../../modules/hr/employees/employee.service';

describe('assertVersion — optimistic concurrency guard', () => {
  it('passes when the client echoes the current version', () => {
    expect(() => assertVersion({ version: 3 }, 3)).not.toThrow();
    expect(() => assertVersion({ version: 3 }, '3' as any)).not.toThrow(); // form-encoded clients
  });

  it('rejects a stale version with 409 CONFLICT', () => {
    expect(() => assertVersion({ version: 4 }, 3, 'purchase order')).toThrow(ConflictException);
    try {
      assertVersion({ version: 4 }, 3, 'purchase order');
    } catch (e: any) {
      expect(e.message).toContain('purchase order');
      expect(e.message).toContain('your version 3');
    }
  });

  it('legacy callers that send no version are unaffected', () => {
    expect(() => assertVersion({ version: 9 }, undefined)).not.toThrow();
    expect(() => assertVersion({ version: 9 }, null)).not.toThrow();
  });

  it('entities without a version column are unaffected', () => {
    expect(() => assertVersion({}, 5)).not.toThrow();
  });
});

describe('EmployeeService.updateEmployee — end-to-end version check', () => {
  const mockRepo = () => ({
    findOne: jest.fn(),
    save: jest.fn((x: any) => Promise.resolve(x)),
    create: jest.fn((x: any) => x),
    find: jest.fn().mockResolvedValue([]),
  });

  it('blocks a concurrent edit and lets a fresh one through', async () => {
    const employeeRepo = mockRepo();
    employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', firstName: 'Old', version: 5 });
    // EmployeeService has many repo deps; only the employee repo matters here.
    const filler = Array.from({ length: 14 }, () => mockRepo());
    const service = new (EmployeeService as any)(employeeRepo, ...filler);

    await expect(service.updateEmployee('t1', 'e1', { firstName: 'New', version: 4 } as any))
      .rejects.toThrow(ConflictException);

    const saved = await service.updateEmployee('t1', 'e1', { firstName: 'New', version: 5 } as any);
    expect(saved.firstName).toBe('New');
    expect((employeeRepo.save.mock.calls[0][0] as any).version).toBe(5); // dto version not blindly assigned
  });
});
