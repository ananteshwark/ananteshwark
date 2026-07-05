import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { talentApi } from '../../api/talent';
import { Plus, Briefcase, Users, ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const APP_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  SCREENING: 'bg-yellow-100 text-yellow-700',
  SHORTLISTED: 'bg-purple-100 text-purple-700',
  INTERVIEW_SCHEDULED: 'bg-orange-100 text-orange-700',
  INTERVIEW_DONE: 'bg-indigo-100 text-indigo-700',
  OFFER_MADE: 'bg-teal-100 text-teal-700',
  OFFER_ACCEPTED: 'bg-green-100 text-green-700',
  OFFER_DECLINED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-red-100 text-red-500',
  HIRED: 'bg-green-100 text-green-800',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
};

function NewJobDialog({ onClose, onSaved, editJob }: { onClose: () => void; onSaved: () => void; editJob?: any }) {
  const [form, setForm] = useState({
    title: editJob?.title ?? '', description: editJob?.description ?? '', type: editJob?.type ?? 'FULL_TIME',
    vacancies: editJob?.vacancies ?? 1, location: editJob?.location ?? '', requirements: editJob?.requirements ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (editJob) await talentApi.updateJobPosting(editJob.id, form);
      else await talentApi.createJobPosting(form);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save job posting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">{editJob ? 'Edit Job Posting' : 'New Job Posting'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
            <input required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vacancies</label>
              <input type="number" min={1} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vacancies} onChange={e => setForm(f => ({ ...f, vacancies: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea required rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Requirements</label>
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Saving...' : editJob ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FunnelView({ jobId }: { jobId: string }) {
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  useEffect(() => {
    talentApi.getHiringFunnel(jobId).then(r => setFunnel(r.data?.data || {}));
  }, [jobId]);
  const total = Object.values(funnel).reduce((a, b) => a + b, 0);
  const statuses = ['NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'OFFER_MADE', 'HIRED', 'REJECTED'];
  return (
    <div className="mt-3 space-y-1">
      {statuses.map(s => (
        <div key={s} className="flex items-center gap-2 text-xs">
          <span className="w-36 text-gray-600">{s.replace(/_/g, ' ')}</span>
          <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
            <div className="bg-blue-500 h-full rounded" style={{ width: total ? `${((funnel[s] || 0) / total) * 100}%` : '0%' }} />
          </div>
          <span className="w-6 text-right text-gray-600">{funnel[s] || 0}</span>
        </div>
      ))}
    </div>
  );
}

export default function AtsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'jobs' | 'applicants'>('jobs');
  const [jobs, setJobs] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editJob, setEditJob] = useState<any>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [filterJobId, setFilterJobId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      const r = await talentApi.getJobPostings({ limit: 50 });
      setJobs(r.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  const loadApplicants = async () => {
    const params: any = { limit: 50 };
    if (filterJobId) params.jobPostingId = filterJobId;
    if (filterStatus) params.status = filterStatus;
    const r = await talentApi.getApplicants(params);
    setApplicants(r.data?.items || []);
  };

  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { if (tab === 'applicants') loadApplicants(); }, [tab, filterJobId, filterStatus]);

  const handlePublish = async (id: string) => {
    await talentApi.publishJob(id);
    loadJobs();
  };

  const handleClose = async (id: string) => {
    await talentApi.closeJob(id);
    loadJobs();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applicant Tracking</h1>
          <p className="text-sm text-gray-500 mt-1">Manage job postings and applications</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Job
        </button>
      </div>

      <div className="flex gap-1 mb-6 border-b">
        {(['jobs', 'applicants'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'jobs' ? 'Job Postings' : 'Applications'}
          </button>
        ))}
      </div>

      {tab === 'jobs' && (
        <div className="space-y-3">
          {loading ? <div className="text-center text-gray-500 py-8">Loading...</div> : jobs.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Briefcase className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No job postings yet. Create your first one.</p>
            </div>
          ) : jobs.map(job => (
            <div key={job.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
                    <span className="text-xs text-gray-500">{job.type?.replace(/_/g, ' ')}</span>
                  </div>
                  {job.location && <p className="text-sm text-gray-500 mt-1">{job.location}</p>}
                  <p className="text-sm text-gray-600 mt-1">{job.vacancies} vacanc{job.vacancies === 1 ? 'y' : 'ies'}</p>
                </div>
                <div className="flex gap-2 ml-4">
                  {job.status === 'DRAFT' && (
                    <button onClick={() => setEditJob(job)} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-100">Edit</button>
                  )}
                  {job.status === 'DRAFT' && (
                    <button onClick={() => handlePublish(job.id)} className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-lg hover:bg-green-100">Publish</button>
                  )}
                  {job.status === 'PUBLISHED' && (
                    <button onClick={() => handleClose(job.id)} className="text-xs bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-100">Close</button>
                  )}
                  <button onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                    Funnel {expandedJob === job.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              {expandedJob === job.id && <FunnelView jobId={job.id} />}
            </div>
          ))}
        </div>
      )}

      {tab === 'applicants' && (
        <div>
          <div className="flex gap-4 mb-4">
            <select className="border rounded-lg px-3 py-2 text-sm" value={filterJobId} onChange={e => setFilterJobId(e.target.value)}>
              <option value="">All Jobs</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <select className="border rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['NEW', 'SCREENING', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'OFFER_MADE', 'HIRED', 'REJECTED'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {applicants.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No applications found.</p>
            </div>
          ) : (
            <div className="bg-white border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Applied</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {applicants.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{a.firstName} {a.lastName}</td>
                      <td className="px-4 py-3 text-gray-600">{a.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${APP_STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-600'}`}>{a.status?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{a.applicationDate}</td>
                      <td className="px-4 py-3">
                        {['SHORTLISTED', 'INTERVIEW_SCHEDULED', 'OFFER_MADE', 'HIRED'].includes(a.status) && (
                          <button onClick={() => navigate('/talent/bgv', {
                            state: { prefill: {
                              subjectType: 'APPLICANT',
                              subjectId: a.id,
                              subjectName: `${a.firstName} ${a.lastName}`.trim(),
                            } },
                          })} className="text-xs text-indigo-600 hover:underline mr-3">Start BGV</button>
                        )}
                        {a.status === 'NEW' && (
                          <button onClick={async () => { await talentApi.shortlistApplicant(a.id); loadApplicants(); }} className="text-xs text-blue-600 hover:underline mr-3">Shortlist</button>
                        )}
                        {!['REJECTED', 'HIRED', 'WITHDRAWN'].includes(a.status) && (
                          <button onClick={async () => { await talentApi.rejectApplicant(a.id); loadApplicants(); }} className="text-xs text-red-600 hover:underline">Reject</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNew && <NewJobDialog onClose={() => setShowNew(false)} onSaved={() => { loadJobs(); }} />}
      {editJob && <NewJobDialog editJob={editJob} onClose={() => setEditJob(null)} onSaved={() => { loadJobs(); }} />}
    </div>
  );
}
