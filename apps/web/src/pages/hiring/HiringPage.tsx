import { useState, useEffect } from 'react';
import {
  Plus, X, ChevronRight, Users, Briefcase, Calendar, FileCheck,
  Clock, CheckCircle2, XCircle, AlertTriangle, Search, Eye,
  Send, ThumbsUp, ThumbsDown, ClipboardList, TrendingUp,
} from 'lucide-react';
import { hiringApi } from '../../api/hiring';
import { hrApi } from '../../api/hr';

type MainTab = 'dashboard' | 'requisitions' | 'pipeline' | 'interviews' | 'offers';

const REQ_STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT:       { label: 'Draft',        color: 'bg-gray-100 text-gray-700' },
  SUBMITTED:   { label: 'Pending',      color: 'bg-yellow-100 text-yellow-700' },
  APPROVED:    { label: 'Approved',     color: 'bg-blue-100 text-blue-700' },
  REJECTED:    { label: 'Rejected',     color: 'bg-red-100 text-red-700' },
  OPEN:        { label: 'Open',         color: 'bg-indigo-100 text-indigo-700' },
  IN_PROGRESS: { label: 'In Progress',  color: 'bg-purple-100 text-purple-700' },
  FULFILLED:   { label: 'Fulfilled',    color: 'bg-green-100 text-green-700' },
  CANCELLED:   { label: 'Cancelled',    color: 'bg-gray-100 text-gray-500' },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Medium', color: 'bg-blue-100 text-blue-700' },
  HIGH:   { label: 'High',   color: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

const PIPELINE_STAGES = [
  { key: 'NEW', label: 'New', color: 'bg-gray-100' },
  { key: 'SCREENING', label: 'Screening', color: 'bg-blue-50' },
  { key: 'SHORTLISTED', label: 'Shortlisted', color: 'bg-indigo-50' },
  { key: 'INTERVIEW_SCHEDULED', label: 'Interview', color: 'bg-purple-50' },
  { key: 'INTERVIEW_DONE', label: 'Interviewed', color: 'bg-violet-50' },
  { key: 'OFFER_MADE', label: 'Offer Made', color: 'bg-yellow-50' },
  { key: 'OFFER_ACCEPTED', label: 'Accepted', color: 'bg-green-50' },
  { key: 'HIRED', label: 'Hired', color: 'bg-green-100' },
];

const OFFER_STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFTED:  { label: 'Drafted',  color: 'bg-gray-100 text-gray-700' },
  SENT:     { label: 'Sent',     color: 'bg-blue-100 text-blue-700' },
  ACCEPTED: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-700' },
  REVOKED:  { label: 'Revoked',  color: 'bg-gray-100 text-gray-500' },
};

const INT_STATUS_META: Record<string, { label: string; color: string }> = {
  SCHEDULED:  { label: 'Scheduled',  color: 'bg-blue-100 text-blue-700' },
  COMPLETED:  { label: 'Completed',  color: 'bg-green-100 text-green-700' },
  CANCELLED:  { label: 'Cancelled',  color: 'bg-gray-100 text-gray-500' },
  NO_SHOW:    { label: 'No Show',    color: 'bg-red-100 text-red-700' },
};

const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const LABEL = 'block text-sm font-medium text-gray-700 mb-1';

const defaultReqForm = () => ({
  title: '', departmentId: '', functionId: '', designationId: '',
  vacancies: 1, employmentType: 'FULL_TIME', priority: 'MEDIUM',
  jobDescription: '', requirements: '', justification: '',
  expectedJoiningDate: '', budgetMin: '', budgetMax: '', currency: 'INR', location: '',
});

export default function HiringPage() {
  const [tab, setTab] = useState<MainTab>('dashboard');
  const [loading, setLoading] = useState(false);

  // Dashboard
  const [dashboard, setDashboard] = useState<any>(null);

  // Requisitions
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [reqFilter, setReqFilter] = useState('');
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqForm, setReqForm] = useState(defaultReqForm());
  const [submittingReq, setSubmittingReq] = useState(false);
  const [reqFormError, setReqFormError] = useState<string | null>(null);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Pipeline
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [applicantForm, setApplicantForm] = useState({ firstName: '', lastName: '', email: '', phone: '', currentCompany: '', totalExperience: '', source: 'DIRECT' });
  const [submittingApplicant, setSubmittingApplicant] = useState(false);

  // Interviews
  const [interviews, setInterviews] = useState<any[]>([]);
  const [showIntModal, setShowIntModal] = useState(false);
  const [intForm, setIntForm] = useState({ applicantId: '', jobPostingId: '', round: 1, interviewType: 'VIDEO', scheduledAt: '', durationMinutes: 60, meetingLink: '', location: '' });
  const [submittingInt, setSubmittingInt] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<{ id: string } | null>(null);
  const [feedback, setFeedback] = useState({ feedback: '', rating: 3, recommendation: 'ADVANCE' });

  // Offers
  const [offers, setOffers] = useState<any[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerForm, setOfferForm] = useState({ applicantId: '', jobPostingId: '', offeredSalary: '', joiningDate: '', offerDate: new Date().toISOString().split('T')[0], validUntil: '', terms: '' });
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Lookup data
  const [departments, setDepartments] = useState<any[]>([]);
  const [functions, setFunctions] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);

  const setRF = (patch: Partial<typeof reqForm>) => setReqForm(f => ({ ...f, ...patch }));

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dashRes, reqRes, pipRes, intRes, offerRes, deptRes, fnRes, desigRes] = await Promise.all([
        hiringApi.getDashboard(),
        hiringApi.getRequisitions({ limit: 100 }),
        hiringApi.getPipeline(),
        hiringApi.getInterviews(),
        hiringApi.getOffers(),
        hrApi.getDepartments({ limit: 200 }),
        hrApi.getFunctions({ limit: 200 }),
        hrApi.getDesignations({ limit: 100 }),
      ]);
      setDashboard(dashRes.data?.data ?? dashRes.data);
      const rData = reqRes.data?.data ?? reqRes.data ?? {};
      setRequisitions(rData.items ?? rData ?? []);
      setPipeline(Array.isArray(pipRes.data?.data) ? pipRes.data.data : Array.isArray(pipRes.data) ? pipRes.data : []);
      setInterviews(Array.isArray(intRes.data?.data) ? intRes.data.data : Array.isArray(intRes.data) ? intRes.data : []);
      setOffers(Array.isArray(offerRes.data?.data) ? offerRes.data.data : Array.isArray(offerRes.data) ? offerRes.data : []);
      const dData = deptRes.data?.data ?? deptRes.data ?? {};
      setDepartments(dData.items ?? dData ?? []);
      setFunctions(fnRes.data?.items ?? fnRes.data?.data?.items ?? []);
      const desigData = desigRes.data?.data ?? desigRes.data ?? {};
      setDesignations(desigData.items ?? desigData ?? []);
    } catch (_) {}
    setLoading(false);
  };

  const fetchApplicants = async (jobPostingId?: string) => {
    try {
      const res = await fetch(`/api/talent/ats/applicants?jobPostingId=${jobPostingId ?? ''}&limit=200`, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
      const json = await res.json();
      setApplicants((json.data?.items ?? json.data ?? []).slice(0, 200));
    } catch (_) {}
  };

  useEffect(() => { fetchAll(); }, []);

  // Selected pipeline job
  const selectedPipelineJob = pipeline.find(p => p.job.id === selectedJobId);

  // Req form submit
  const handleCreateReq = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReq(true);
    setReqFormError(null);
    try {
      const payload: any = { ...reqForm, vacancies: Number(reqForm.vacancies) };
      if (payload.budgetMin) payload.budgetMin = Number(payload.budgetMin); else delete payload.budgetMin;
      if (payload.budgetMax) payload.budgetMax = Number(payload.budgetMax); else delete payload.budgetMax;
      ['departmentId', 'functionId', 'designationId', 'requirements', 'justification', 'expectedJoiningDate', 'location'].forEach(k => { if (!payload[k]) delete payload[k]; });
      await hiringApi.createRequisition(payload);
      setShowReqModal(false);
      setReqForm(defaultReqForm());
      fetchAll();
    } catch (err: any) {
      setReqFormError(err?.response?.data?.message ?? 'Failed to create requisition');
    }
    setSubmittingReq(false);
  };

  const handleReqAction = async (action: string, id: string, extra?: any) => {
    try {
      if (action === 'submit') await hiringApi.submitRequisition(id);
      else if (action === 'approve') await hiringApi.approveRequisition(id);
      else if (action === 'open') await hiringApi.openRequisition(id);
      else if (action === 'cancel') await hiringApi.cancelRequisition(id);
      else if (action === 'reject') {
        await hiringApi.rejectRequisition(id, { reason: extra });
        setShowRejectModal(null);
        setRejectReason('');
      }
      fetchAll();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Action failed');
    }
  };

  const handleAddApplicant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingApplicant(true);
    try {
      await hiringApi.submitApplication({ ...applicantForm, jobPostingId: selectedJobId, totalExperience: applicantForm.totalExperience ? Number(applicantForm.totalExperience) : undefined });
      setShowAddApplicant(false);
      setApplicantForm({ firstName: '', lastName: '', email: '', phone: '', currentCompany: '', totalExperience: '', source: 'DIRECT' });
      fetchAll();
    } catch (err: any) { alert(err?.response?.data?.message ?? 'Failed'); }
    setSubmittingApplicant(false);
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingInt(true);
    try {
      await hiringApi.scheduleInterview({ ...intForm, round: Number(intForm.round), durationMinutes: Number(intForm.durationMinutes) });
      setShowIntModal(false);
      setIntForm({ applicantId: '', jobPostingId: '', round: 1, interviewType: 'VIDEO', scheduledAt: '', durationMinutes: 60, meetingLink: '', location: '' });
      fetchAll();
    } catch (err: any) { alert(err?.response?.data?.message ?? 'Failed'); }
    setSubmittingInt(false);
  };

  const handleRecordFeedback = async () => {
    if (!showFeedbackModal) return;
    try {
      await hiringApi.recordFeedback(showFeedbackModal.id, feedback);
      setShowFeedbackModal(null);
      fetchAll();
    } catch (err: any) { alert(err?.response?.data?.message ?? 'Failed'); }
  };

  const handleMakeOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOffer(true);
    try {
      await hiringApi.makeOffer({ ...offerForm, offeredSalary: Number(offerForm.offeredSalary) });
      setShowOfferModal(false);
      setOfferForm({ applicantId: '', jobPostingId: '', offeredSalary: '', joiningDate: '', offerDate: new Date().toISOString().split('T')[0], validUntil: '', terms: '' });
      fetchAll();
    } catch (err: any) { alert(err?.response?.data?.message ?? 'Failed'); }
    setSubmittingOffer(false);
  };

  const tabButton = (t: MainTab, label: string, icon: React.ReactNode) => (
    <button onClick={() => setTab(t)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
      {icon} {label}
    </button>
  );

  const filteredReqs = requisitions.filter(r => !reqFilter || r.status === reqFilter);

  return (
    <div className="p-6 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Briefcase className="h-6 w-6 text-indigo-600" /> Hiring</h1>
        <p className="text-sm text-gray-500 mt-1">End-to-end hiring: manpower requests → job posting → pipeline → offers → onboarding</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6 overflow-x-auto">
        {tabButton('dashboard', 'Dashboard', <TrendingUp className="h-4 w-4" />)}
        {tabButton('requisitions', 'Requisitions', <ClipboardList className="h-4 w-4" />)}
        {tabButton('pipeline', 'Pipeline', <Users className="h-4 w-4" />)}
        {tabButton('interviews', 'Interviews', <Calendar className="h-4 w-4" />)}
        {tabButton('offers', 'Offers', <FileCheck className="h-4 w-4" />)}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading...</div>}

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && !loading && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Requisitions', value: dashboard.totalReqs, icon: <ClipboardList className="h-5 w-5 text-indigo-500" />, color: 'bg-indigo-50' },
              { label: 'Pending Approval', value: dashboard.pendingApproval, icon: <Clock className="h-5 w-5 text-yellow-500" />, color: 'bg-yellow-50' },
              { label: 'Open Jobs', value: dashboard.openJobs, icon: <Briefcase className="h-5 w-5 text-blue-500" />, color: 'bg-blue-50' },
              { label: 'Total Candidates', value: dashboard.totalCandidates, icon: <Users className="h-5 w-5 text-purple-500" />, color: 'bg-purple-50' },
              { label: 'Approved Reqs', value: dashboard.approvedReqs, icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, color: 'bg-green-50' },
              { label: 'Interviews Scheduled', value: dashboard.interviewsScheduled, icon: <Calendar className="h-5 w-5 text-teal-500" />, color: 'bg-teal-50' },
              { label: 'Pending Offers', value: dashboard.pendingOffers, icon: <FileCheck className="h-5 w-5 text-orange-500" />, color: 'bg-orange-50' },
            ].map(card => (
              <div key={card.label} className={`${card.color} rounded-xl p-4 border border-white shadow-sm`}>
                <div className="flex items-center justify-between mb-2">{card.icon}</div>
                <div className="text-2xl font-bold text-gray-900">{card.value ?? 0}</div>
                <div className="text-xs text-gray-600 mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Requisition status breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Hiring Pipeline Overview</h2>
            <div className="flex flex-wrap gap-6">
              {Object.entries(REQ_STATUS_META).map(([status, meta]) => {
                const count = requisitions.filter(r => r.status === status).length;
                return (
                  <div key={status} className="text-center">
                    <div className="text-xl font-bold text-gray-900">{count}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent requisitions */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-sm font-semibold text-gray-700">Recent Requisitions</h2>
              <button onClick={() => setTab('requisitions')} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">View all <ChevronRight className="h-3 w-3" /></button>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {requisitions.slice(0, 5).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 px-5">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.title}</td>
                    <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_META[r.priority]?.color ?? ''}`}>{r.priority}</span></td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{r.vacancies} position{r.vacancies !== 1 ? 's' : ''}</td>
                    <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${REQ_STATUS_META[r.status]?.color ?? ''}`}>{REQ_STATUS_META[r.status]?.label ?? r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Requisitions ── */}
      {tab === 'requisitions' && !loading && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <select value={reqFilter} onChange={e => setReqFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">All Status</option>
                {Object.entries(REQ_STATUS_META).map(([s, m]) => <option key={s} value={s}>{m.label}</option>)}
              </select>
            </div>
            <button onClick={() => { setShowReqModal(true); setReqFormError(null); setReqForm(defaultReqForm()); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
              <Plus className="h-4 w-4" /> New Requisition
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role / Title</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Positions</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Expected Joining</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReqs.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No requisitions found. Create one to start hiring.</td></tr>
                ) : filteredReqs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.title}</div>
                      {r.rejectionReason && <div className="text-xs text-red-600 mt-0.5">Rejected: {r.rejectionReason}</div>}
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_META[r.priority]?.color ?? ''}`}>{r.priority}</span></td>
                    <td className="px-4 py-3 text-gray-600">{r.vacancies}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.employmentType?.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.expectedJoiningDate ?? '-'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${REQ_STATUS_META[r.status]?.color ?? ''}`}>{REQ_STATUS_META[r.status]?.label ?? r.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setSelectedReq(r)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Eye className="h-3.5 w-3.5" /></button>
                        {r.status === 'DRAFT' && <button onClick={() => handleReqAction('submit', r.id)} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Send className="h-3 w-3" /> Submit</button>}
                        {r.status === 'SUBMITTED' && <>
                          <button onClick={() => handleReqAction('approve', r.id)} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Approve</button>
                          <button onClick={() => setShowRejectModal({ id: r.id })} className="text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"><ThumbsDown className="h-3 w-3" /> Reject</button>
                        </>}
                        {r.status === 'APPROVED' && <button onClick={() => handleReqAction('open', r.id)} className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Post Job</button>}
                        {r.status === 'OPEN' && <button onClick={() => { setTab('pipeline'); setSelectedJobId(r.jobPostingId ?? ''); }} className="text-xs px-2.5 py-1 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 flex items-center gap-1"><Users className="h-3 w-3" /> Pipeline</button>}
                        {!['FULFILLED', 'CANCELLED'].includes(r.status) && <button onClick={() => handleReqAction('cancel', r.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded"><XCircle className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pipeline ── */}
      {tab === 'pipeline' && !loading && (
        <div>
          <div className="flex items-center gap-4 mb-5">
            <select
              value={selectedJobId}
              onChange={e => { setSelectedJobId(e.target.value); fetchApplicants(e.target.value); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-64"
            >
              <option value="">Select a job posting...</option>
              {pipeline.map(p => <option key={p.job.id} value={p.job.id}>{p.job.title} ({p.total} candidates)</option>)}
            </select>
            {selectedJobId && (
              <button onClick={() => setShowAddApplicant(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                <Plus className="h-4 w-4" /> Add Candidate
              </button>
            )}
          </div>

          {!selectedJobId ? (
            <div className="text-center py-16 text-gray-400">Select a job posting to view the hiring pipeline</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-3 min-w-max pb-4">
                {PIPELINE_STAGES.map(stage => {
                  const candidates = selectedPipelineJob?.byStage[stage.key] ?? [];
                  return (
                    <div key={stage.key} className="w-52 flex-shrink-0">
                      <div className={`${stage.color} rounded-t-lg px-3 py-2 border border-gray-200 border-b-0`}>
                        <div className="text-xs font-semibold text-gray-700">{stage.label}</div>
                        <div className="text-lg font-bold text-gray-900">{candidates.length}</div>
                      </div>
                      <div className="border border-gray-200 rounded-b-lg bg-white min-h-32 p-2 space-y-2">
                        {candidates.map((c: any) => (
                          <div key={c.id} className="bg-white border border-gray-100 rounded-lg p-2.5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</div>
                            <div className="text-xs text-gray-500 truncate">{c.email}</div>
                            {c.currentCompany && <div className="text-xs text-gray-400 mt-0.5 truncate">{c.currentCompany}</div>}
                            <div className="flex gap-1 mt-2">
                              {stage.key === 'NEW' && <button onClick={() => hiringApi.shortlistApplicant(c.id).then(fetchAll)} className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Shortlist</button>}
                              {!['HIRED', 'REJECTED', 'WITHDRAWN'].includes(stage.key) && <button onClick={() => hiringApi.rejectApplicant(c.id).then(fetchAll)} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100">Reject</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Interviews ── */}
      {tab === 'interviews' && !loading && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowIntModal(true); fetchApplicants(); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
              <Plus className="h-4 w-4" /> Schedule Interview
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Applicant ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Round</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled At</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {interviews.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No interviews scheduled yet</td></tr>
                ) : interviews.map((i: any) => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{i.applicantId?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-600">Round {i.round}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{i.interviewType}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{i.scheduledAt ? new Date(i.scheduledAt).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{i.durationMinutes} min</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${INT_STATUS_META[i.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>{INT_STATUS_META[i.status]?.label ?? i.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      {i.status === 'SCHEDULED' && (
                        <button onClick={() => { setShowFeedbackModal({ id: i.id }); setFeedback({ feedback: '', rating: 3, recommendation: 'ADVANCE' }); }}
                          className="text-xs px-2.5 py-1 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">
                          Record Feedback
                        </button>
                      )}
                      {i.rating && <span className="text-xs text-gray-400 ml-2">★ {i.rating}/5</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Offers ── */}
      {tab === 'offers' && !loading && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setShowOfferModal(true); fetchApplicants(); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
              <Plus className="h-4 w-4" /> Make Offer
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Applicant</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Offered Salary</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Joining Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Valid Until</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Offer Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No offers made yet</td></tr>
                ) : offers.map((o: any) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.applicantId?.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-medium text-gray-900">₹{Number(o.offeredSalary).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{o.joiningDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{o.validUntil}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{o.offerDate}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${OFFER_STATUS_META[o.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>{OFFER_STATUS_META[o.status]?.label ?? o.status}</span></td>
                    <td className="px-4 py-3 text-right flex gap-1.5 justify-end">
                      {['DRAFTED', 'SENT'].includes(o.status) && <>
                        <button onClick={() => hiringApi.acceptOffer(o.id).then(fetchAll)} className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">Accept</button>
                        <button onClick={() => hiringApi.declineOffer(o.id).then(fetchAll)} className="text-xs px-2.5 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700">Decline</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════ MODALS ═══════ */}

      {/* Requisition detail side panel */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{selectedReq.title}</h2>
              <button onClick={() => setSelectedReq(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${REQ_STATUS_META[selectedReq.status]?.color}`}>{REQ_STATUS_META[selectedReq.status]?.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_META[selectedReq.priority]?.color}`}>{selectedReq.priority}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Positions</span><p className="font-medium">{selectedReq.vacancies}</p></div>
                <div><span className="text-gray-500">Type</span><p className="font-medium">{selectedReq.employmentType?.replace('_', ' ')}</p></div>
                <div><span className="text-gray-500">Location</span><p className="font-medium">{selectedReq.location ?? '-'}</p></div>
                <div><span className="text-gray-500">Expected Joining</span><p className="font-medium">{selectedReq.expectedJoiningDate ?? '-'}</p></div>
                {selectedReq.budgetMin && <div><span className="text-gray-500">Budget</span><p className="font-medium">₹{Number(selectedReq.budgetMin).toLocaleString()} – ₹{Number(selectedReq.budgetMax).toLocaleString()}</p></div>}
              </div>
              <div><p className="text-gray-500 mb-1 font-medium">Job Description</p><p className="text-gray-700 whitespace-pre-wrap">{selectedReq.jobDescription}</p></div>
              {selectedReq.requirements && <div><p className="text-gray-500 mb-1 font-medium">Requirements</p><p className="text-gray-700 whitespace-pre-wrap">{selectedReq.requirements}</p></div>}
              {selectedReq.justification && <div><p className="text-gray-500 mb-1 font-medium">Business Justification</p><p className="text-gray-700 whitespace-pre-wrap">{selectedReq.justification}</p></div>}
              {selectedReq.rejectionReason && <div className="p-3 bg-red-50 rounded-lg text-red-700"><p className="font-medium">Rejection Reason</p><p>{selectedReq.rejectionReason}</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* New Requisition modal */}
      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-600" /> New Manpower Requisition</h2>
              <button onClick={() => setShowReqModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateReq} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {reqFormError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{reqFormError}</div>}
                <div>
                  <label className={LABEL}>Job Title / Role *</label>
                  <input required value={reqForm.title} onChange={e => setRF({ title: e.target.value })} className={INPUT} placeholder="e.g. Senior Software Engineer" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Department</label>
                    <select value={reqForm.departmentId} onChange={e => setRF({ departmentId: e.target.value })} className={INPUT}>
                      <option value="">Select department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Function</label>
                    <select value={reqForm.functionId} onChange={e => setRF({ functionId: e.target.value })} className={INPUT}>
                      <option value="">Select function</option>
                      {functions.filter(f => !reqForm.departmentId || f.departmentId === reqForm.departmentId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Designation</label>
                    <select value={reqForm.designationId} onChange={e => setRF({ designationId: e.target.value })} className={INPUT}>
                      <option value="">Select</option>
                      {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Positions *</label>
                    <input required type="number" min={1} value={reqForm.vacancies} onChange={e => setRF({ vacancies: Number(e.target.value) })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Priority</label>
                    <select value={reqForm.priority} onChange={e => setRF({ priority: e.target.value })} className={INPUT}>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL}>Employment Type</label>
                    <select value={reqForm.employmentType} onChange={e => setRF({ employmentType: e.target.value })} className={INPUT}>
                      <option value="FULL_TIME">Full Time</option>
                      <option value="PART_TIME">Part Time</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="INTERN">Intern</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Location</label>
                    <input value={reqForm.location} onChange={e => setRF({ location: e.target.value })} className={INPUT} placeholder="e.g. Mumbai / Remote" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>Budget Min (₹)</label>
                    <input type="number" min={0} value={reqForm.budgetMin} onChange={e => setRF({ budgetMin: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Budget Max (₹)</label>
                    <input type="number" min={0} value={reqForm.budgetMax} onChange={e => setRF({ budgetMax: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Expected Joining</label>
                    <input type="date" value={reqForm.expectedJoiningDate} onChange={e => setRF({ expectedJoiningDate: e.target.value })} className={INPUT} />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Job Description *</label>
                  <textarea required rows={4} value={reqForm.jobDescription} onChange={e => setRF({ jobDescription: e.target.value })} className={INPUT} placeholder="Describe the role, responsibilities, and day-to-day activities..." />
                </div>
                <div>
                  <label className={LABEL}>Requirements / Qualifications</label>
                  <textarea rows={3} value={reqForm.requirements} onChange={e => setRF({ requirements: e.target.value })} className={INPUT} placeholder="Required skills, experience, education..." />
                </div>
                <div>
                  <label className={LABEL}>Business Justification</label>
                  <textarea rows={2} value={reqForm.justification} onChange={e => setRF({ justification: e.target.value })} className={INPUT} placeholder="Why is this position needed?" />
                </div>
              </div>
              <div className="flex gap-3 p-5 border-t flex-shrink-0">
                <button type="button" onClick={() => setShowReqModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submittingReq} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{submittingReq ? 'Creating...' : 'Create Requisition'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject requisition modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Reject Requisition</h2>
              <button onClick={() => setShowRejectModal(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className={LABEL}>Rejection Reason</label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} className={INPUT} placeholder="Explain why this requisition is being rejected..." />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRejectModal(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={() => handleReqAction('reject', showRejectModal.id, rejectReason)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700">Reject</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add applicant modal */}
      {showAddApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold">Add Candidate</h2>
              <button onClick={() => setShowAddApplicant(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleAddApplicant} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>First Name *</label><input required value={applicantForm.firstName} onChange={e => setApplicantForm(f => ({ ...f, firstName: e.target.value }))} className={INPUT} /></div>
                <div><label className={LABEL}>Last Name *</label><input required value={applicantForm.lastName} onChange={e => setApplicantForm(f => ({ ...f, lastName: e.target.value }))} className={INPUT} /></div>
              </div>
              <div><label className={LABEL}>Email *</label><input required type="email" value={applicantForm.email} onChange={e => setApplicantForm(f => ({ ...f, email: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Phone</label><input value={applicantForm.phone} onChange={e => setApplicantForm(f => ({ ...f, phone: e.target.value }))} className={INPUT} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Current Company</label><input value={applicantForm.currentCompany} onChange={e => setApplicantForm(f => ({ ...f, currentCompany: e.target.value }))} className={INPUT} /></div>
                <div><label className={LABEL}>Experience (yrs)</label><input type="number" min={0} value={applicantForm.totalExperience} onChange={e => setApplicantForm(f => ({ ...f, totalExperience: e.target.value }))} className={INPUT} /></div>
              </div>
              <div><label className={LABEL}>Source</label>
                <select value={applicantForm.source} onChange={e => setApplicantForm(f => ({ ...f, source: e.target.value }))} className={INPUT}>
                  {['DIRECT', 'REFERRAL', 'LINKEDIN', 'JOB_BOARD', 'AGENCY', 'OTHER'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddApplicant(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submittingApplicant} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">{submittingApplicant ? 'Adding...' : 'Add Candidate'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule interview modal */}
      {showIntModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold">Schedule Interview</h2>
              <button onClick={() => setShowIntModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleScheduleInterview} className="p-5 space-y-3">
              <div>
                <label className={LABEL}>Job Posting *</label>
                <select required value={intForm.jobPostingId} onChange={e => { setIntForm(f => ({ ...f, jobPostingId: e.target.value })); fetchApplicants(e.target.value); }} className={INPUT}>
                  <option value="">Select job...</option>
                  {pipeline.map(p => <option key={p.job.id} value={p.job.id}>{p.job.title}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Candidate *</label>
                <select required value={intForm.applicantId} onChange={e => setIntForm(f => ({ ...f, applicantId: e.target.value }))} className={INPUT}>
                  <option value="">Select candidate...</option>
                  {applicants.filter(a => !intForm.jobPostingId || a.jobPostingId === intForm.jobPostingId).map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} ({a.email})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Round</label><input type="number" min={1} value={intForm.round} onChange={e => setIntForm(f => ({ ...f, round: Number(e.target.value) }))} className={INPUT} /></div>
                <div>
                  <label className={LABEL}>Type</label>
                  <select value={intForm.interviewType} onChange={e => setIntForm(f => ({ ...f, interviewType: e.target.value }))} className={INPUT}>
                    {['PHONE', 'VIDEO', 'IN_PERSON', 'TECHNICAL', 'HR'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Date & Time *</label><input required type="datetime-local" value={intForm.scheduledAt} onChange={e => setIntForm(f => ({ ...f, scheduledAt: e.target.value }))} className={INPUT} /></div>
                <div><label className={LABEL}>Duration (min)</label><input type="number" min={15} value={intForm.durationMinutes} onChange={e => setIntForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} className={INPUT} /></div>
              </div>
              <div><label className={LABEL}>Meeting Link</label><input value={intForm.meetingLink} onChange={e => setIntForm(f => ({ ...f, meetingLink: e.target.value }))} className={INPUT} placeholder="https://meet.google.com/..." /></div>
              <div><label className={LABEL}>Location</label><input value={intForm.location} onChange={e => setIntForm(f => ({ ...f, location: e.target.value }))} className={INPUT} placeholder="Room / Address" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowIntModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submittingInt} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">{submittingInt ? 'Scheduling...' : 'Schedule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold">Record Interview Feedback</h2>
              <button onClick={() => setShowFeedbackModal(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className={LABEL}>Overall Rating (1-5)</label>
                <input type="number" min={1} max={5} value={feedback.rating} onChange={e => setFeedback(f => ({ ...f, rating: Number(e.target.value) }))} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Recommendation</label>
                <select value={feedback.recommendation} onChange={e => setFeedback(f => ({ ...f, recommendation: e.target.value }))} className={INPUT}>
                  <option value="ADVANCE">Advance</option>
                  <option value="HOLD">Hold</option>
                  <option value="REJECT">Reject</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Feedback Notes</label>
                <textarea rows={3} value={feedback.feedback} onChange={e => setFeedback(f => ({ ...f, feedback: e.target.value }))} className={INPUT} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowFeedbackModal(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleRecordFeedback} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Make offer modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-base font-semibold">Make Job Offer</h2>
              <button onClick={() => setShowOfferModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleMakeOffer} className="p-5 space-y-3">
              <div>
                <label className={LABEL}>Job Posting *</label>
                <select required value={offerForm.jobPostingId} onChange={e => { setOfferForm(f => ({ ...f, jobPostingId: e.target.value })); fetchApplicants(e.target.value); }} className={INPUT}>
                  <option value="">Select job...</option>
                  {pipeline.map(p => <option key={p.job.id} value={p.job.id}>{p.job.title}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Candidate *</label>
                <select required value={offerForm.applicantId} onChange={e => setOfferForm(f => ({ ...f, applicantId: e.target.value }))} className={INPUT}>
                  <option value="">Select candidate...</option>
                  {applicants.filter(a => !offerForm.jobPostingId || a.jobPostingId === offerForm.jobPostingId).map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} ({a.email})</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Offered Salary (₹/year) *</label>
                <input required type="number" min={0} value={offerForm.offeredSalary} onChange={e => setOfferForm(f => ({ ...f, offeredSalary: e.target.value }))} className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL}>Offer Date *</label><input required type="date" value={offerForm.offerDate} onChange={e => setOfferForm(f => ({ ...f, offerDate: e.target.value }))} className={INPUT} /></div>
                <div><label className={LABEL}>Valid Until *</label><input required type="date" value={offerForm.validUntil} onChange={e => setOfferForm(f => ({ ...f, validUntil: e.target.value }))} className={INPUT} /></div>
              </div>
              <div><label className={LABEL}>Joining Date *</label><input required type="date" value={offerForm.joiningDate} onChange={e => setOfferForm(f => ({ ...f, joiningDate: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Terms / Notes</label><textarea rows={2} value={offerForm.terms} onChange={e => setOfferForm(f => ({ ...f, terms: e.target.value }))} className={INPUT} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowOfferModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submittingOffer} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">{submittingOffer ? 'Sending...' : 'Make Offer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
