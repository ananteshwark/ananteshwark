import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { benefitsApi } from '../../api/benefits';
import { clsx } from 'clsx';
import { Plus, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

const cycleStatusColor = (s: string) => ({
  DRAFT: 'bg-gray-100 text-gray-600',
  OPEN: 'bg-blue-100 text-blue-800',
  REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-800',
}[s] ?? 'bg-gray-100 text-gray-600');

const planTypeColor = (t: string) => ({
  HEALTH: 'bg-red-100 text-red-800',
  DENTAL: 'bg-blue-100 text-blue-800',
  VISION: 'bg-purple-100 text-purple-800',
  LIFE: 'bg-green-100 text-green-800',
  RETIREMENT: 'bg-yellow-100 text-yellow-800',
  DISABILITY: 'bg-orange-100 text-orange-800',
  OTHER: 'bg-gray-100 text-gray-600',
}[t] ?? 'bg-gray-100 text-gray-600');

export default function BenefitsPage() {
  const [tab, setTab] = useState<'plans' | 'enrollments' | 'salary-bands' | 'merit'>('plans');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showBandModal, setShowBandModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: plansData } = useQuery({ queryKey: ['ben-plans'], queryFn: () => benefitsApi.getPlans() });
  const { data: enrollData } = useQuery({ queryKey: ['ben-enrollments'], queryFn: () => benefitsApi.getEnrollments() });
  const { data: bandsData } = useQuery({ queryKey: ['ben-bands'], queryFn: () => benefitsApi.getSalaryBands() });
  const { data: cyclesData } = useQuery({ queryKey: ['ben-cycles'], queryFn: () => benefitsApi.getMeritCycles() });
  const { data: allocsData } = useQuery({ queryKey: ['ben-allocs', selectedCycleId], queryFn: () => selectedCycleId ? benefitsApi.getAllocations(selectedCycleId) : null, enabled: !!selectedCycleId });

  const plans = plansData?.data?.items ?? [];
  const enrollments = enrollData?.data ?? [];
  const bands = bandsData?.data ?? [];
  const cycles = cyclesData?.data?.items ?? [];
  const allocations = allocsData?.data ?? [];

  const createPlan = useMutation({ mutationFn: (d: any) => benefitsApi.createPlan(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ben-plans'] }); setShowPlanModal(false); } });
  const enroll = useMutation({ mutationFn: (d: any) => benefitsApi.enroll(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ben-enrollments'] }); setShowEnrollModal(false); } });
  const createBand = useMutation({ mutationFn: (d: any) => benefitsApi.createSalaryBand(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ben-bands'] }); setShowBandModal(false); } });
  const createCycle = useMutation({ mutationFn: (d: any) => benefitsApi.createMeritCycle(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ben-cycles'] }); setShowCycleModal(false); } });
  const updateCycleStatus = useMutation({ mutationFn: ({ id, status }: any) => benefitsApi.updateCycleStatus(id, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ben-cycles'] }) });
  const approveAlloc = useMutation({ mutationFn: ({ id, status }: any) => benefitsApi.approveAllocation(selectedCycleId!, id, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['ben-allocs', selectedCycleId] }) });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Benefits & Compensation</h1>
          <p className="text-gray-500 text-sm mt-1">Benefit plans, enrollments, salary bands, and merit cycles</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Benefit Plans</div><div className="text-2xl font-bold">{plans.length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Active Enrollments</div><div className="text-2xl font-bold text-green-600">{enrollments.filter((e: any) => e.status === 'ACTIVE').length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Salary Bands</div><div className="text-2xl font-bold">{bands.length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Open Merit Cycles</div><div className="text-2xl font-bold text-blue-600">{cycles.filter((c: any) => c.status === 'OPEN').length}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['plans', 'enrollments', 'salary-bands', 'merit'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-2 text-sm font-medium', tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'plans' ? 'Benefit Plans' : t === 'enrollments' ? 'Enrollments' : t === 'salary-bands' ? 'Salary Bands' : 'Merit Cycles'}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowPlanModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Plan</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {plans.length === 0 && <div className="col-span-2 text-center py-8 text-gray-400">No benefit plans</div>}
            {plans.map((plan: any) => (
              <div key={plan.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold">{plan.name}</span><span className={clsx('text-xs px-2 py-0.5 rounded-full', planTypeColor(plan.type))}>{plan.type}</span></div>
                    <div className="text-xs text-gray-500">{plan.code}</div>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full', plan.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{plan.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>Employer: {plan.contributionType === 'PERCENTAGE' ? `${plan.employerContribution}%` : `$${plan.employerContribution}`}</div>
                  <div>Employee: {plan.contributionType === 'PERCENTAGE' ? `${plan.employeeContribution}%` : `$${plan.employeeContribution}`}</div>
                </div>
                <div className="text-xs text-gray-400 mt-1">Effective: {plan.effectiveFrom}{plan.effectiveTo ? ` → ${plan.effectiveTo}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'enrollments' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowEnrollModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Enroll Employee</button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Employee ID', 'Plan ID', 'Status', 'Enrolled', 'Terminated'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {enrollments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No enrollments</td></tr>}
                {enrollments.map((e: any) => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{e.employeeId}</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.planId}</td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs', e.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : e.status === 'TERMINATED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600')}>{e.status}</span></td>
                    <td className="px-4 py-3 text-xs">{e.enrollmentDate}</td>
                    <td className="px-4 py-3 text-xs">{e.terminationDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'salary-bands' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowBandModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Band</button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Grade', 'Level', 'Job Family', 'Min', 'Mid', 'Max', 'Currency'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {bands.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No salary bands defined</td></tr>}
                {bands.map((b: any) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold">{b.grade}</td>
                    <td className="px-4 py-3">{b.level}</td>
                    <td className="px-4 py-3">{b.jobFamily ?? '—'}</td>
                    <td className="px-4 py-3">{Number(b.minimum).toLocaleString()}</td>
                    <td className="px-4 py-3 text-blue-700 font-medium">{Number(b.midpoint).toLocaleString()}</td>
                    <td className="px-4 py-3">{Number(b.maximum).toLocaleString()}</td>
                    <td className="px-4 py-3">{b.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'merit' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCycleModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> New Merit Cycle</button>
          </div>
          <div className="space-y-4">
            {cycles.length === 0 && <div className="text-center py-8 text-gray-400">No merit cycles</div>}
            {cycles.map((cycle: any) => (
              <div key={cycle.id} className="bg-white rounded-xl border">
                <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setSelectedCycleId(selectedCycleId === cycle.id ? null : cycle.id)}>
                  <div>
                    <div className="font-semibold">{cycle.name} <span className="text-gray-400 font-normal">({cycle.year})</span></div>
                    <div className="text-xs text-gray-500">{cycle.startDate} → {cycle.endDate} · Budget: {cycle.budgetPct}%</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', cycleStatusColor(cycle.status))}>{cycle.status}</span>
                    {cycle.status === 'DRAFT' && <button onClick={e => { e.stopPropagation(); updateCycleStatus.mutate({ id: cycle.id, status: 'OPEN' }); }} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Open Cycle</button>}
                    {cycle.status === 'OPEN' && <button onClick={e => { e.stopPropagation(); updateCycleStatus.mutate({ id: cycle.id, status: 'REVIEW' }); }} className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">Send for Review</button>}
                    {cycle.status === 'REVIEW' && <button onClick={e => { e.stopPropagation(); updateCycleStatus.mutate({ id: cycle.id, status: 'APPROVED' }); }} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>}
                    {selectedCycleId === cycle.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>
                {selectedCycleId === cycle.id && (
                  <div className="border-t px-4 py-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">Merit Allocations</div>
                    {allocations.length === 0 ? (
                      <div className="text-xs text-gray-400 py-2">No allocations yet</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500"><th className="text-left py-1">Employee</th><th className="text-right">Current</th><th className="text-right">Increase %</th><th className="text-right">New Salary</th><th className="text-center">Status</th><th className="text-center">Action</th></tr></thead>
                        <tbody>
                          {allocations.map((a: any) => (
                            <tr key={a.id} className="border-t">
                              <td className="py-1.5 font-mono">{a.employeeId.slice(0, 8)}…</td>
                              <td className="text-right">{Number(a.currentSalary).toLocaleString()}</td>
                              <td className="text-right">{a.proposedIncreasePct}%</td>
                              <td className="text-right font-medium">{Number(a.newSalary).toLocaleString()}</td>
                              <td className="text-center"><span className={clsx('px-1.5 py-0.5 rounded text-xs', a.status === 'APPROVED' ? 'bg-green-100 text-green-800' : a.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600')}>{a.status}</span></td>
                              <td className="text-center">
                                {a.status === 'DRAFT' && (
                                  <div className="flex items-center justify-center gap-1">
                                    <button onClick={() => approveAlloc.mutate({ id: a.id, status: 'APPROVED' })} className="text-green-600 hover:text-green-800"><Check className="h-3 w-3" /></button>
                                    <button onClick={() => approveAlloc.mutate({ id: a.id, status: 'REJECTED' })} className="text-red-500 hover:text-red-700"><X className="h-3 w-3" /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Benefit Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[500px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createPlan.mutate({ code: f.get('code'), name: f.get('name'), type: f.get('type'), employerContribution: Number(f.get('employerContribution')), employeeContribution: Number(f.get('employeeContribution')), contributionType: f.get('contributionType'), effectiveFrom: f.get('effectiveFrom'), effectiveTo: f.get('effectiveTo') || undefined }); }}>
            <h2 className="text-lg font-semibold mb-4">Add Benefit Plan</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Code</label><input name="code" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Type</label>
                  <select name="type" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    {['HEALTH','DENTAL','VISION','LIFE','RETIREMENT','DISABILITY','OTHER'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500">Contribution Type</label>
                  <select name="contributionType" className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="FIXED">Fixed Amount</option><option value="PERCENTAGE">Percentage</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Employer Contribution</label><input name="employerContribution" type="number" step="0.01" defaultValue="0" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Employee Contribution</label><input name="employeeContribution" type="number" step="0.01" defaultValue="0" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Effective From</label><input name="effectiveFrom" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Effective To</label><input name="effectiveTo" type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowPlanModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); enroll.mutate({ employeeId: f.get('employeeId'), planId: f.get('planId'), enrollmentDate: f.get('enrollmentDate') }); }}>
            <h2 className="text-lg font-semibold mb-4">Enroll Employee</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Employee ID (UUID)</label><input name="employeeId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Plan ID (UUID)</label><input name="planId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Enrollment Date</label><input name="enrollmentDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowEnrollModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Salary Band Modal */}
      {showBandModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createBand.mutate({ grade: f.get('grade'), level: f.get('level'), jobFamily: f.get('jobFamily') || undefined, minimum: Number(f.get('minimum')), midpoint: Number(f.get('midpoint')), maximum: Number(f.get('maximum')), currency: f.get('currency') || 'USD', effectiveFrom: f.get('effectiveFrom') }); }}>
            <h2 className="text-lg font-semibold mb-4">Add Salary Band</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500">Grade</label><input name="grade" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. L3" /></div>
                <div><label className="text-xs text-gray-500">Level</label><input name="level" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. Senior" /></div>
                <div><label className="text-xs text-gray-500">Currency</label><input name="currency" defaultValue="USD" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Job Family</label><input name="jobFamily" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. Engineering" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500">Minimum</label><input name="minimum" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Midpoint</label><input name="midpoint" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Maximum</label><input name="maximum" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Effective From</label><input name="effectiveFrom" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowBandModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Merit Cycle Modal */}
      {showCycleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createCycle.mutate({ name: f.get('name'), year: Number(f.get('year')), startDate: f.get('startDate'), endDate: f.get('endDate'), budgetPct: Number(f.get('budgetPct')) || 3 }); }}>
            <h2 className="text-lg font-semibold mb-4">New Merit Cycle</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. FY2026 Merit" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Year</label><input name="year" type="number" required defaultValue={new Date().getFullYear()} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Budget %</label><input name="budgetPct" type="number" step="0.1" defaultValue="3" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Start Date</label><input name="startDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">End Date</label><input name="endDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowCycleModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
