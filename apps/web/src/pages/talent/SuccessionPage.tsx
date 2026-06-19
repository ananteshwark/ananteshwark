import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { Network, Plus, X } from 'lucide-react';

const CRITICALITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const READINESS_LABELS: Record<string, string> = {
  READY_NOW: 'Ready Now',
  READY_1_2_YEARS: '1-2 Years',
  READY_3_5_YEARS: '3-5 Years',
};

const READINESS_COLORS: Record<string, string> = {
  READY_NOW: 'bg-green-100 text-green-700',
  READY_1_2_YEARS: 'bg-yellow-100 text-yellow-700',
  READY_3_5_YEARS: 'bg-red-100 text-red-700',
};

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [positionTitle, setPositionTitle] = useState('');
  const [criticality, setCriticality] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await talentApi.createSuccessionPlan({ positionTitle, criticality });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Succession Plan</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position Title</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={positionTitle}
              onChange={e => setPositionTitle(e.target.value)}
              placeholder="e.g. Chief Financial Officer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={criticality}
              onChange={e => setCriticality(e.target.value)}
            >
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddCandidateModal({ planId, onClose, onAdded }: { planId: string; onClose: () => void; onAdded: () => void }) {
  const [employeeId, setEmployeeId] = useState('');
  const [readinessLevel, setReadinessLevel] = useState('READY_1_2_YEARS');
  const [developmentActions, setDevelopmentActions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await talentApi.addSuccessorCandidate({ planId, employeeId, readinessLevel, developmentActions: developmentActions || undefined });
      onAdded();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add candidate');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Successor Candidate</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="Employee UUID"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Readiness Level</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={readinessLevel}
              onChange={e => setReadinessLevel(e.target.value)}
            >
              {Object.entries(READINESS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Development Actions</label>
            <textarea
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={developmentActions}
              onChange={e => setDevelopmentActions(e.target.value)}
              placeholder="Key development actions for this candidate..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuccessionPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showAddCandidate, setShowAddCandidate] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await talentApi.getSuccessionPlans({ limit: 50 });
      setPlans(res.data?.items || res.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadPlanDetail = async (plan: any) => {
    setSelectedPlan(plan);
    const res = await talentApi.getSuccessionPlan(plan.id);
    const detail = res.data;
    setCandidates(detail?.candidates || []);
  };

  useEffect(() => { loadPlans(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Succession Planning</h1>
          <p className="text-sm text-gray-500 mt-1">Identify and develop candidates for critical roles</p>
        </div>
        <button
          onClick={() => setShowCreatePlan(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plans list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wider">Succession Plans</h2>
          {loading ? (
            <div className="text-center text-gray-500 py-12">Loading...</div>
          ) : plans.length === 0 ? (
            <div className="text-center text-gray-500 py-16 bg-white border rounded-xl">
              <Network className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No succession plans yet</p>
              <p className="text-sm mt-1">Create a plan for a critical position</p>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map(plan => (
                <div
                  key={plan.id}
                  onClick={() => loadPlanDetail(plan)}
                  className={`bg-white border rounded-xl p-4 cursor-pointer transition-colors hover:border-blue-300 ${selectedPlan?.id === plan.id ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{plan.positionTitle}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Status: {plan.status}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[plan.criticality] || 'bg-gray-100 text-gray-700'}`}>
                      {plan.criticality}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan detail / candidates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              {selectedPlan ? `Candidates — ${selectedPlan.positionTitle}` : 'Candidates'}
            </h2>
            {selectedPlan && (
              <button
                onClick={() => setShowAddCandidate(true)}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Candidate
              </button>
            )}
          </div>

          {!selectedPlan ? (
            <div className="text-center text-gray-400 py-16 bg-white border rounded-xl border-dashed">
              <p className="text-sm">Select a plan to view candidates</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center text-gray-500 py-12 bg-white border rounded-xl">
              <p className="font-medium">No candidates yet</p>
              <p className="text-sm mt-1">Add successor candidates to this plan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((c: any) => (
                <div key={c.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{c.employeeId}</p>
                      {c.developmentActions && (
                        <p className="text-xs text-gray-500 mt-1">{c.developmentActions}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${READINESS_COLORS[c.readinessLevel] || 'bg-gray-100 text-gray-700'}`}>
                      {READINESS_LABELS[c.readinessLevel] || c.readinessLevel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreatePlan && (
        <CreatePlanModal
          onClose={() => setShowCreatePlan(false)}
          onCreated={loadPlans}
        />
      )}
      {showAddCandidate && selectedPlan && (
        <AddCandidateModal
          planId={selectedPlan.id}
          onClose={() => setShowAddCandidate(false)}
          onAdded={() => loadPlanDetail(selectedPlan)}
        />
      )}
    </div>
  );
}
