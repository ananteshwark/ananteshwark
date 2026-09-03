import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Employee, EmployeeStatus } from '../../hr/employees/entities/employee.entity';
import { Department } from '../../hr/employees/entities/department.entity';
import { Recognition } from '../../engagement/entities/recognition.entity';

export interface OnaEdge {
  fromEmployeeId: string;
  toEmployeeId: string;
  weight: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Org network analysis over signals the system already captures. Phase 1
 * builds the collaboration graph from peer recognition (who appreciates whom)
 * layered on the reporting hierarchy, and surfaces the classic ONA reads:
 * connectors, cross-team bridges, isolated employees, department cohesion
 * (silo risk), and manager span. Detectors degrade gracefully when a source
 * module is not deployed.
 */
@Injectable()
export class OnaService {
  constructor(
    @Optional() @InjectRepository(Employee) private readonly employeeRepo?: Repository<Employee>,
    @Optional() @InjectRepository(Department) private readonly departmentRepo?: Repository<Department>,
    @Optional() @InjectRepository(Recognition) private readonly recognitionRepo?: Repository<Recognition>,
  ) {}

  async analyze(tenantId: string) {
    if (!this.employeeRepo) {
      return { available: false, reason: 'HR module is not available in this deployment' };
    }
    const employees = await this.employeeRepo.find({
      where: { tenantId, status: In([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE]) } as any,
    });
    const departments = this.departmentRepo ? await this.departmentRepo.find({ where: { tenantId } as any }) : [];
    const deptName = new Map(departments.map((d: any) => [d.id, d.name]));

    const byId = new Map(employees.map((e) => [e.id, e]));
    const byUserId = new Map(employees.filter((e) => e.userId).map((e) => [e.userId as string, e]));
    const nameOf = (e: Employee) => [e.firstName, e.lastName].filter(Boolean).join(' ');

    // ── Collaboration edges from recognition (undirected, weighted) ────────
    const recognitions = this.recognitionRepo ? await this.recognitionRepo.find({ where: { tenantId } as any }) : [];
    const edgeMap = new Map<string, OnaEdge>();
    for (const r of recognitions) {
      const from = byUserId.get(r.fromUserId);
      const to = byId.get(r.toEmployeeId);
      if (!from || !to || from.id === to.id) continue;
      const key = [from.id, to.id].sort().join('|');
      const edge = edgeMap.get(key) ?? { fromEmployeeId: from.id, toEmployeeId: to.id, weight: 0 };
      edge.weight += 1;
      edgeMap.set(key, edge);
    }
    const edges = Array.from(edgeMap.values());

    // ── Per-employee degree + cross-department reach ───────────────────────
    const neighbors = new Map<string, Map<string, number>>();
    const addNeighbor = (a: string, b: string, w: number) => {
      const m = neighbors.get(a) ?? new Map<string, number>();
      m.set(b, (m.get(b) ?? 0) + w);
      neighbors.set(a, m);
    };
    for (const e of edges) {
      addNeighbor(e.fromEmployeeId, e.toEmployeeId, e.weight);
      addNeighbor(e.toEmployeeId, e.fromEmployeeId, e.weight);
    }

    const centrality = employees
      .map((emp) => {
        const m = neighbors.get(emp.id);
        if (!m) return null;
        const distinct = m.size;
        const weight = Array.from(m.values()).reduce((s, w) => s + w, 0);
        const crossDept = Array.from(m.keys()).filter((otherId) => {
          const other = byId.get(otherId);
          return other && other.departmentId !== emp.departmentId;
        }).length;
        return {
          employeeId: emp.id,
          name: nameOf(emp),
          department: deptName.get(emp.departmentId ?? '') ?? null,
          connections: distinct,
          interactionWeight: weight,
          crossDeptConnections: crossDept,
          crossDeptRatio: distinct ? round2(crossDept / distinct) : 0,
        };
      })
      .filter(Boolean) as Array<any>;

    const topConnectors = [...centrality]
      .sort((a, b) => b.interactionWeight - a.interactionWeight || b.connections - a.connections)
      .slice(0, 10);

    // Bridges: well-connected people whose network mostly spans departments.
    const bridges = centrality
      .filter((c) => c.connections >= 2 && c.crossDeptRatio >= 0.5)
      .sort((a, b) => b.crossDeptConnections - a.crossDeptConnections)
      .slice(0, 10);

    const isolated = employees.filter((e) => !neighbors.has(e.id));

    // ── Department cohesion / silo risk ────────────────────────────────────
    const deptStats = new Map<string, { internal: number; external: number }>();
    for (const e of edges) {
      const a = byId.get(e.fromEmployeeId)!;
      const b = byId.get(e.toEmployeeId)!;
      for (const deptId of new Set([a.departmentId, b.departmentId])) {
        if (!deptId) continue;
        const s = deptStats.get(deptId) ?? { internal: 0, external: 0 };
        if (a.departmentId === b.departmentId) s.internal += e.weight;
        else s.external += e.weight;
        deptStats.set(deptId, s);
      }
    }
    const departmentsOut = Array.from(deptStats.entries()).map(([deptId, s]) => {
      const total = s.internal + s.external;
      const cohesion = total ? round2(s.internal / total) : 0;
      return {
        departmentId: deptId,
        department: deptName.get(deptId) ?? deptId,
        internalInteractions: s.internal,
        externalInteractions: s.external,
        cohesion,
        // High internal share with real volume ⇒ the team talks mostly to itself.
        siloRisk: total >= 3 && cohesion >= 0.85,
      };
    }).sort((a, b) => b.cohesion - a.cohesion);

    // ── Manager span of control ────────────────────────────────────────────
    const reports = new Map<string, number>();
    for (const e of employees) {
      if (e.managerId) reports.set(e.managerId, (reports.get(e.managerId) ?? 0) + 1);
    }
    const spans = Array.from(reports.entries())
      .map(([managerId, count]) => {
        const mgr = byId.get(managerId);
        return {
          managerId,
          name: mgr ? nameOf(mgr) : 'Unknown manager',
          directReports: count,
          overloaded: count > 10,
        };
      })
      .sort((a, b) => b.directReports - a.directReports);

    return {
      available: true,
      sources: {
        recognition: !!this.recognitionRepo,
        hierarchy: true,
      },
      summary: {
        employees: employees.length,
        interactions: recognitions.length,
        edges: edges.length,
        connectedEmployees: neighbors.size,
        isolatedEmployees: isolated.length,
        avgSpan: spans.length ? round2(spans.reduce((s, m) => s + m.directReports, 0) / spans.length) : 0,
      },
      topConnectors,
      bridges,
      isolated: isolated.slice(0, 20).map((e) => ({
        employeeId: e.id,
        name: nameOf(e),
        department: deptName.get(e.departmentId ?? '') ?? null,
      })),
      departments: departmentsOut,
      managerSpans: spans.slice(0, 20),
    };
  }
}
