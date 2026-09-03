import { OnaService } from './ona.service';

const mockRepo = (rows: any[] = []) => ({ find: jest.fn().mockResolvedValue(rows) });

const emp = (id: string, name: string, dept: string | null, opts: any = {}) => ({
  id, firstName: name, lastName: '', departmentId: dept, status: 'ACTIVE',
  userId: opts.userId ?? `u-${id}`, managerId: opts.managerId ?? null,
});

describe('OnaService', () => {
  // Engineering: e1 (manager), e2, e3. Sales: s1, s2. Loner: l1 (no edges).
  const employees = [
    emp('e1', 'Asha', 'eng'),
    emp('e2', 'Ben', 'eng', { managerId: 'e1' }),
    emp('e3', 'Chitra', 'eng', { managerId: 'e1' }),
    emp('s1', 'Dev', 'sales', { managerId: 'e1' }),
    emp('s2', 'Esha', 'sales'),
    emp('l1', 'Farid', 'sales'),
  ];
  const departments = [
    { id: 'eng', name: 'Engineering' },
    { id: 'sales', name: 'Sales' },
  ];
  // Recognition edges: e2↔e3 twice (intra-eng), e2↔s1 and e2↔s2 (cross-dept),
  // s1↔s2 (intra-sales).
  const recognitions = [
    { fromUserId: 'u-e2', toEmployeeId: 'e3' },
    { fromUserId: 'u-e3', toEmployeeId: 'e2' },
    { fromUserId: 'u-e2', toEmployeeId: 's1' },
    { fromUserId: 'u-s2', toEmployeeId: 'e2' },
    { fromUserId: 'u-s1', toEmployeeId: 's2' },
    { fromUserId: 'u-ghost', toEmployeeId: 'e2' }, // unknown sender → dropped
    { fromUserId: 'u-e2', toEmployeeId: 'e2' },    // self → dropped
  ];

  const build = () =>
    new OnaService(
      mockRepo(employees) as any,
      mockRepo(departments) as any,
      mockRepo(recognitions) as any,
    );

  it('builds the weighted collaboration graph and ranks connectors', async () => {
    const result: any = await build().analyze('t1');
    expect(result.available).toBe(true);
    expect(result.summary).toMatchObject({
      employees: 6, edges: 4, connectedEmployees: 4, isolatedEmployees: 2,
    });
    // e2 touches e3 (x2), s1, s2 → weight 4 across 3 neighbors.
    expect(result.topConnectors[0]).toMatchObject({
      employeeId: 'e2', name: 'Ben', connections: 3, interactionWeight: 4,
    });
  });

  it('flags cross-department bridges and isolated employees', async () => {
    const result: any = await build().analyze('t1');
    const bridge = result.bridges.find((b: any) => b.employeeId === 'e2');
    expect(bridge).toBeDefined();
    expect(bridge.crossDeptConnections).toBe(2); // s1, s2
    const isolatedIds = result.isolated.map((i: any) => i.employeeId);
    expect(isolatedIds).toContain('l1'); // never appears on an edge
    expect(isolatedIds).toContain('e1'); // manager with no recognition edges
  });

  it('scores department cohesion and marks silo risk only with volume', async () => {
    const result: any = await build().analyze('t1');
    const eng = result.departments.find((d: any) => d.departmentId === 'eng');
    // eng edges: internal e2↔e3 weight 2; external e2↔s1, e2↔s2 weight 2 → cohesion 0.5
    expect(eng).toMatchObject({ internalInteractions: 2, externalInteractions: 2, cohesion: 0.5, siloRisk: false });
  });

  it('reports manager span of control', async () => {
    const result: any = await build().analyze('t1');
    expect(result.managerSpans[0]).toMatchObject({ managerId: 'e1', directReports: 3, overloaded: false });
    expect(result.summary.avgSpan).toBe(3);
  });

  it('degrades gracefully without the engagement module and without HR', async () => {
    const noRecognition: any = await new OnaService(
      mockRepo(employees) as any, mockRepo(departments) as any, undefined,
    ).analyze('t1');
    expect(noRecognition.available).toBe(true);
    expect(noRecognition.sources.recognition).toBe(false);
    expect(noRecognition.summary.edges).toBe(0);
    expect(noRecognition.managerSpans.length).toBeGreaterThan(0); // hierarchy still works

    const noHr: any = await new OnaService().analyze('t1');
    expect(noHr.available).toBe(false);
  });
});
