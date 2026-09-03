import { useState, useEffect } from 'react';
import { Plus, X, PlayCircle, StopCircle, BarChart3, ClipboardList } from 'lucide-react';
import { engagementApi } from '../../api/engagement';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-blue-100 text-blue-700',
};

const Q_TYPES = [
  { value: 'RATING', label: 'Rating (1–5)' },
  { value: 'SCALE_10', label: 'Scale (0–10, eNPS)' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'TEXT', label: 'Free text' },
];

function BuilderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', type: 'PULSE', anonymous: true });
  const [questions, setQuestions] = useState<any[]>([{ text: '', type: 'RATING' }]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await engagementApi.createSurvey({ ...form, questions: questions.filter(q => q.text.trim()) });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create survey');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Survey</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Survey title"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Description (optional)"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="border rounded-lg px-3 py-2 text-sm" value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {['PULSE', 'ENGAGEMENT', 'ENPS', 'CUSTOM'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.anonymous}
                onChange={e => setForm(p => ({ ...p, anonymous: e.target.checked }))} />
              Anonymous responses
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Questions</p>
            {questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <input className="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder={`Question ${i + 1}`}
                  value={q.text} onChange={e => setQuestions(prev => prev.map((p, j) => j === i ? { ...p, text: e.target.value } : p))} />
                <select className="border rounded-lg px-2 py-1.5 text-xs" value={q.type}
                  onChange={e => setQuestions(prev => prev.map((p, j) => j === i ? { ...p, type: e.target.value } : p))}>
                  {Q_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            ))}
            <button onClick={() => setQuestions([...questions, { text: '', type: 'RATING' }])}
              className="text-xs text-blue-600 hover:underline">+ Add question</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim() || !questions.some(q => q.text.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RespondModal({ survey, onClose, onDone }: { survey: any; onClose: () => void; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const set = (qid: string, v: any) => setAnswers(p => ({ ...p, [qid]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await engagementApi.respond(survey.id, answers);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{survey.title}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        {survey.anonymous && <p className="text-xs text-green-600 mb-3">Your responses are anonymous.</p>}
        <div className="space-y-4">
          {survey.questions.map((q: any) => (
            <div key={q.id}>
              <p className="text-sm font-medium mb-1.5">{q.text}</p>
              {q.type === 'TEXT' ? (
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={answers[q.id] ?? ''} onChange={e => set(q.id, e.target.value)} />
              ) : q.type === 'YES_NO' ? (
                <div className="flex gap-2">
                  {['YES', 'NO'].map(v => (
                    <button key={v} onClick={() => set(q.id, v === 'YES')}
                      className={`px-4 py-1.5 rounded-lg border text-sm ${answers[q.id] === (v === 'YES') ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>
                      {v === 'YES' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: q.type === 'RATING' ? 5 : 11 }, (_, i) => q.type === 'RATING' ? i + 1 : i).map(n => (
                    <button key={n} onClick={() => set(q.id, n)}
                      className={`w-8 h-8 rounded-lg border text-sm ${answers[q.id] === n ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultsModal({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    engagementApi.getResults(surveyId).then(r => setResults(r.data)).catch(() => {
      alert('You do not have permission to view results.');
      onClose();
    });
  }, [surveyId]);

  if (!results) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">{results.title} — Results</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{results.responseCount} response{results.responseCount === 1 ? '' : 's'}</p>
        <div className="space-y-4">
          {results.questions.map((q: any) => (
            <div key={q.questionId} className="border rounded-lg p-3">
              <p className="text-sm font-medium">{q.text}</p>
              <p className="text-xs text-gray-400 mb-1">{q.count} answered</p>
              {q.type === 'TEXT' ? (
                <ul className="space-y-1">
                  {(q.answers || []).map((a: string, i: number) => (
                    <li key={i} className="text-sm text-gray-700 italic">“{a}”</li>
                  ))}
                </ul>
              ) : q.type === 'YES_NO' ? (
                <p className="text-2xl font-bold text-blue-700">{q.yesPercent}% <span className="text-sm font-normal text-gray-500">said yes</span></p>
              ) : (
                <div className="flex items-baseline gap-4">
                  <p className="text-2xl font-bold text-blue-700">{q.average}<span className="text-sm font-normal text-gray-500"> avg</span></p>
                  {q.enps !== undefined && (
                    <p className={`text-2xl font-bold ${q.enps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {q.enps > 0 ? '+' : ''}{q.enps}<span className="text-sm font-normal text-gray-500"> eNPS</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [responding, setResponding] = useState<any>(null);
  const [viewResults, setViewResults] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    engagementApi.getSurveys().then(r => setSurveys(r.data || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (fn: () => Promise<any>) => {
    try { await fn(); load(); } catch (e: any) { alert(e?.response?.data?.message || 'Action failed'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surveys & Pulse</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pulse checks, engagement surveys, and eNPS</p>
        </div>
        <button onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Survey
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : surveys.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No surveys yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Title', 'Type', 'Questions', 'Anonymous', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {surveys.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{s.title}</td>
                  <td className="px-4 py-2 text-gray-500">{s.type}</td>
                  <td className="px-4 py-2 text-gray-500">{s.questions?.length ?? 0}</td>
                  <td className="px-4 py-2 text-gray-500">{s.anonymous ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {s.status === 'DRAFT' && (
                        <button onClick={() => act(() => engagementApi.publishSurvey(s.id))}
                          className="text-green-600 hover:text-green-800 p-1" title="Publish">
                          <PlayCircle className="h-4 w-4" />
                        </button>
                      )}
                      {s.status === 'ACTIVE' && (
                        <>
                          <button onClick={() => setResponding(s)}
                            className="text-blue-600 hover:text-blue-800 p-1" title="Respond">
                            <ClipboardList className="h-4 w-4" />
                          </button>
                          <button onClick={() => act(() => engagementApi.closeSurvey(s.id))}
                            className="text-red-500 hover:text-red-700 p-1" title="Close">
                            <StopCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {s.status !== 'DRAFT' && (
                        <button onClick={() => setViewResults(s.id)}
                          className="text-indigo-600 hover:text-indigo-800 p-1" title="Results">
                          <BarChart3 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBuilder && <BuilderModal onClose={() => setShowBuilder(false)} onDone={() => { setShowBuilder(false); load(); }} />}
      {responding && <RespondModal survey={responding} onClose={() => setResponding(null)} onDone={() => { setResponding(null); load(); }} />}
      {viewResults && <ResultsModal surveyId={viewResults} onClose={() => setViewResults(null)} />}
    </div>
  );
}
