import { useState, useEffect } from 'react';
import { Plus, X, Trash2, CheckCircle } from 'lucide-react';
import { financeApi } from '../../api/finance';

interface LineItem {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  source?: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  totalDebit: number;
  totalCredit: number;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800',
  POSTED: 'bg-green-100 text-green-800',
  REVERSED: 'bg-red-100 text-red-800',
};

const emptyLine = (): LineItem => ({ accountId: '', description: '', debit: '', credit: '' });

const defaultForm = {
  date: new Date().toISOString().split('T')[0],
  description: '',
};

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getJournalEntries();
      setEntries(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;

  const handleAddLine = () => setLines([...lines, emptyLine()]);
  const handleRemoveLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const handleLineChange = (i: number, field: keyof LineItem, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setFormError('Journal entry is not balanced. Total debits must equal total credits.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await financeApi.createJournalEntry({
        ...form,
        lines: lines
          .filter((l) => l.accountId)
          .map((l) => ({
            accountId: l.accountId,
            description: l.description,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
      });
      setShowModal(false);
      setForm(defaultForm);
      setLines([emptyLine(), emptyLine()]);
      fetchEntries();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create journal entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    setActionError(null);
    try {
      await financeApi.postJournalEntry(id);
      fetchEntries();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? 'Failed to post journal entry');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this journal entry?')) return;
    setActionError(null);
    try {
      await financeApi.deleteJournalEntry(id);
      fetchEntries();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? 'Failed to delete journal entry');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(defaultForm);
    setLines([emptyLine(), emptyLine()]);
    setFormError(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Journal Entries</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Journal Entry
        </button>
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Credit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No journal entries found</td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{entry.entryNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{entry.date?.split('T')[0]}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{entry.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{entry.source ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[entry.status] ?? 'bg-gray-100 text-gray-800'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(entry.totalDebit).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(entry.totalCredit).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => handlePost(entry.id)}
                            title="Post"
                            className="p-1 text-green-600 hover:text-green-800"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            title="Delete"
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">New Journal Entry</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Journal entry description"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Line Items</label>
                  <span className={`text-xs font-medium ${isBalanced ? 'text-green-600' : 'text-red-500'}`}>
                    {isBalanced ? 'Balanced' : `Out of balance (DR: ${totalDebit.toFixed(2)}, CR: ${totalCredit.toFixed(2)})`}
                  </span>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Account ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Debit</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Credit</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((line, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={line.accountId}
                              onChange={(e) => handleLineChange(i, 'accountId', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Account ID"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => handleLineChange(i, 'description', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Description"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.debit}
                              onChange={(e) => handleLineChange(i, 'debit', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.credit}
                              onChange={(e) => handleLineChange(i, 'credit', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-2 py-1">
                            {lines.length > 2 && (
                              <button type="button" onClick={() => handleRemoveLine(i)} className="text-red-400 hover:text-red-600">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Line
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
