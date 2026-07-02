import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { RunService } from './run.service';
import { PayrollRun, PayrollRunStatus } from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { ComponentService } from '../components/component.service';
import { StatutoryService } from '../statutory/statutory.service';
import { RetroPayrollService } from '../retro/retro-payroll.service';
import { GlService } from '../../finance/gl/gl.service';
import { PayrollGlService } from '../payroll-gl.service';

const repo = () => ({ findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn((x) => Promise.resolve(x)) });
const stub = {} as any;

describe('RunService.createRun — duplicate-period guard (H2)', () => {
  let service: RunService;
  let runRepo: any;

  beforeEach(async () => {
    runRepo = repo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RunService,
        { provide: getRepositoryToken(PayrollRun), useValue: runRepo },
        { provide: getRepositoryToken(Payslip), useValue: repo() },
        { provide: getRepositoryToken(Employee), useValue: repo() },
        { provide: getRepositoryToken(Account), useValue: repo() },
        { provide: ComponentService, useValue: stub },
        { provide: StatutoryService, useValue: stub },
        { provide: RetroPayrollService, useValue: stub },
        { provide: GlService, useValue: stub },
        { provide: PayrollGlService, useValue: stub },
        { provide: DataSource, useValue: stub },
      ],
    }).compile();
    service = moduleRef.get(RunService);
  });

  it('rejects a second run for the same period + type', async () => {
    runRepo.findOne.mockResolvedValue({ id: 'existing', status: PayrollRunStatus.DRAFT });
    await expect(
      service.createRun('t1', { payPeriodMonth: 7, payPeriodYear: 2026 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(runRepo.save).not.toHaveBeenCalled();
  });

  it('creates when no run exists for that period', async () => {
    runRepo.findOne.mockResolvedValue(null);
    const run = await service.createRun('t1', { payPeriodMonth: 7, payPeriodYear: 2026 } as any);
    expect(run.status).toBe(PayrollRunStatus.DRAFT);
    expect(runRepo.save).toHaveBeenCalled();
  });
});
