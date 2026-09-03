import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { Star, ClipboardCheck, BarChart2, Plus, X } from 'lucide-react';

const FORM_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  SUBMITTED: 'bg-green-100 text-green-700',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-700',
};

const CYCLE_STATUS_COLORS: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-700',
  SELF_REVIEW: 'bg-yellow-100 text-yellow-700',
  MANAGER_REVIEW: 'bg-orange-100 text-orange-700',
  CALIBRATION: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

const CALIBRATION_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
};

function CreateCalibrationModal({ cycles, onClose, onCreated }: { cycles: any[]; onClose: () => void; onCreated: () => void }) {
  const [cycleId, setCycleId] = useState(cycles[0]?.id || '');
  const [facilitatorId, setFacilitatorId] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await talentApi.createCalibration({ cycleId, facilitatorId, sessionDate, notes: notes || undefined, employeeIds: [] });
      onCreated();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create calibration session');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Calibration Session</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Review Cycle</label>
            <select required className="w-full border rounded-lg px-3 py-2 text-sm" value={cycleId} onChange={e => setCycleId(e.target.value)}>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Facilitator ID</label>
            <input required className="w-full border rounded-lg px-3 py-2 text-sm" value={facilitatorId} onChange={e => setFacilitatorId(e.target.value)} placeholder="User UUID" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Date</label>
            <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional session notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onChange?.(i)} className={`${onChange ? 'cursor-pointer' : 'cursor-default'}`}>
          <Star className={`h-5 w-5 ${i <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
        </button>
      ))}
    </div>
  );
}

export default function PerformancePage() {
  const [tab, setTab] = useState<'my-review' | 'team' | 'calibration'>('my-review');
  const [cycles, setCycles] = useState<any[]>([]);
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateCalibration, setShowCreateCalibration] = useState(false);

  const loadData = () => Promise.all([
    talentApi.getReviewCycles(),
    talentApi.getReviewForms({ limit: 50 }),
    talentApi.listCalibrations(),
  ]).then(([r1, r2, r3]) => {
    setCycles(r1.data?.data || []);
    setForms(r2.data?.items || []);
    setCalibrations(r3.data?.data || []);
  }).finally(() => setLoading(false));

  useEffect(() => { loadData(); }, []);

  const selfForms = forms.filter(f => f.type === 'SELF');
  const teamForms = forms.filter(f => f.type === 'MANAGER');

  const handleSubmit = async () => {
    if (!selectedForm) return;
    setSubmitting(true);
    try {
      await talentApi.submitReview(selectedForm.id, { overallRating: rating, comments });
      const r = await talentApi.getReviewForms({ limit: 50 });
      setForms(r.data?.items || []);
      setSelectedForm(null);
      setRating(0);
      setComments('');
      alert('Review submitted successfully!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Performance Reviews</h1>
        <p className="text-sm text-gray-500 mt-1">Manage review cycles and performance evaluations</p>
      </div>

      <div className="flex gap-1 mb-6 border-b">
        {([['my-review', 'My Review', <ClipboardCheck className="h-4 w-4" />], ['team', 'Team Reviews', <BarChart2 className="h-4 w-4" />], ['calibration', 'Calibration', <Star className="h-4 w-4" />]] as const).map(([t, label, icon]) => (
          <button key={t} onClick={() => setTab(t as any)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center text-gray-500 py-8">Loading...</div> : (
        <>
          {tab === 'my-review' && (
            <div className="space-y-4">
              {selfForms.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-white border rounded-xl">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No self-review forms assigned to you.</p>
                </div>
              ) : selfForms.map(form => (
                <div key={form.id} className="bg-white border rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Self Review</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FORM_STATUS_COLORS[form.status]}`}>{form.status}</span>
                  </div>
                  {form.status === 'PENDING' || form.status === 'IN_PROGRESS' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Overall Rating</label>
                        <StarRating value={selectedForm?.id === form.id ? rating : 0} onChange={v => { setSelectedForm(form); setRating(v); }} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                        <textarea rows={4} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Share your self-assessment..."
                          value={selectedForm?.id === form.id ? comments : ''} onChange={e => { setSelectedForm(form); setComments(e.target.value); }} />
                      </div>
                      <button onClick={handleSubmit} disabled={submitting || selectedForm?.id !== form.id} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {submitting ? 'Submitting...' : 'Submit Review'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <StarRating value={Number(form.overallRating) || 0} />
                      {form.comments && <p className="text-sm text-gray-600 mt-2">{form.comments}</p>}
                      <p className="text-xs text-gray-500 mt-2">Submitted: {form.submittedAt ? new Date(form.submittedAt).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'team' && (
            <div className="space-y-3">
              {teamForms.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-white border rounded-xl">
                  <BarChart2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No team reviews assigned.</p>
                </div>
              ) : teamForms.map(form => (
                <div key={form.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Employee: {form.employeeId?.slice(0, 8)}...</p>
                      <p className="text-xs text-gray-500">Type: {form.type}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {form.overallRating && <StarRating value={Number(form.overallRating)} />}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FORM_STATUS_COLORS[form.status]}`}>{form.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'calibration' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Calibration Sessions</h2>
                <button
                  onClick={() => setShowCreateCalibration(true)}
                  disabled={cycles.length === 0}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                  New Session
                </button>
              </div>
              {calibrations.length === 0 ? (
                <div className="text-center text-gray-500 py-12 bg-white border rounded-xl">
                  <Star className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No calibration sessions yet</p>
                  <p className="text-sm mt-1">Create a calibration session for a review cycle</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {calibrations.map(session => (
                    <div key={session.id} className="bg-white border rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">Session — {session.sessionDate}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Cycle: {session.cycleId?.slice(0, 8)}... | Facilitator: {session.facilitatorId?.slice(0, 8)}...
                          </p>
                          {session.notes && <p className="text-xs text-gray-400 mt-1">{session.notes}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CALIBRATION_STATUS_COLORS[session.status] || 'bg-gray-100 text-gray-600'}`}>
                            {session.status}
                          </span>
                          {session.status !== 'COMPLETED' && (
                            <button
                              onClick={async () => {
                                await talentApi.completeCalibration(session.id);
                                loadData();
                              }}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              Mark Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCreateCalibration && (
        <CreateCalibrationModal
          cycles={cycles}
          onClose={() => setShowCreateCalibration(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
