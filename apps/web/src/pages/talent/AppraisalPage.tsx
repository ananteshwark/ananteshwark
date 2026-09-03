import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { Award, CheckCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  APPROVED: 'bg-green-100 text-green-700',
};

export default function AppraisalPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await talentApi.getAppraisalResults({ limit: 50 });
      setResults(r.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      await talentApi.approveAppraisalResult(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to approve');
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Appraisal Cycles</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve appraisal results</p>
      </div>

      {loading ? <div className="text-center text-gray-500 py-8">Loading...</div> : results.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Award className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No appraisal results found.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rating</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Label</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Increment</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Promotion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.employeeId?.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-yellow-600">{r.finalRating}</span>
                      <span className="text-gray-400">/ 5</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.ratingLabel}</td>
                  <td className="px-4 py-3 text-gray-600">{r.incrementPercent ? `${r.incrementPercent}%` : '—'}</td>
                  <td className="px-4 py-3">
                    {r.promotionRecommended ? <CheckCircle className="h-4 w-4 text-green-500" /> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'DRAFT' && (
                      <button onClick={() => handleApprove(r.id)} disabled={approving === r.id} className="text-xs text-green-600 hover:underline disabled:opacity-50">
                        {approving === r.id ? 'Approving...' : 'Approve'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
