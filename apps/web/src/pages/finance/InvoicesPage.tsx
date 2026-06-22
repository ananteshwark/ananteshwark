import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle, Ban } from 'lucide-react';
import { financeApi } from '../../api/finance';

interface Customer {
  id: string;
  name: string;
}

interface InvoiceLine {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: { name: string };
  invoiceDate: string;
  dueDate?: string;
  total: number;
  balanceDue: number;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'VOID' | 'OVERDUE';
}

const STATUS_FILTERS = ['All', 'DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE'];

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  VOID: 'bg-red-100 text-red-800',
  OVERDUE: 'bg-orange-100 text-orange-800',
};

const emptyLine = (): InvoiceLine => ({
  description: '',
  accountId: '',
  quantity: '1',
  unitPrice: '0',
  taxRate: '0',
});

const defaultForm = {
  customerId: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: '',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter !== 'All' ? { status: statusFilter } : {};
      const res = await financeApi.getInvoices(params);
      setInvoices(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await financeApi.getCustomers();
      setCustomers(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleLineChange = (i: number, field: keyof InvoiceLine, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await financeApi.createInvoice({
        ...form,
        dueDate: form.dueDate || undefined,
        lines: lines
          .filter((l) => l.description || l.accountId)
          .map((l) => ({
            description: l.description,
            accountId: l.accountId,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            taxRate: parseFloat(l.taxRate) || 0,
          })),
      });
      setShowModal(false);
      setForm(defaultForm);
      setLines([emptyLine()]);
      fetchInvoices();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async (id: string) => {
    setActionError(null);
    try {
      await financeApi.postInvoice(id);
      fetchInvoices();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? 'Failed to post invoice');
    }
  };

  const handleVoid = async (id: string) => {
    if (!window.confirm('Void this invoice?')) return;
    setActionError(null);
    try {
      await financeApi.voidInvoice(id);
      fetchInvoices();
    } catch (err: any) {
      setActionError(err?.response?.data?.message ?? 'Failed to void invoice');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(defaultForm);
    setLines([emptyLine()]);
    setFormError(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No invoices found</td>
                </tr>
              )}
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {invoice.customer?.name ?? customers.find((c) => c.id === invoice.customerId)?.name ?? invoice.customerId}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{invoice.invoiceDate?.split('T')[0]}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{invoice.dueDate?.split('T')[0] ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(invoice.total).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(invoice.balanceDue).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[invoice.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {invoice.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePost(invoice.id)}
                          title="Post"
                          className="p-1 text-green-600 hover:text-green-800"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {(invoice.status === 'SENT' || invoice.status === 'PARTIAL') && (
                        <button
                          onClick={() => handleVoid(invoice.id)}
                          title="Void"
                          className="p-1 text-red-500 hover:text-red-700"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
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
              <h2 className="text-lg font-semibold text-gray-900">New Invoice</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <select
                    required
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="INV-0001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    required
                    value={form.invoiceDate}
                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (optional)</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Account ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Tax %</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((line, i) => (
                        <tr key={i}>
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
                              type="text"
                              value={line.accountId}
                              onChange={(e) => handleLineChange(i, 'accountId', e.target.value)}
                              className="w-28 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Account ID"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(i, 'quantity', e.target.value)}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => handleLineChange(i, 'unitPrice', e.target.value)}
                              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.taxRate}
                              onChange={(e) => handleLineChange(i, 'taxRate', e.target.value)}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            {lines.length > 1 && (
                              <button type="button" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">
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
                  onClick={() => setLines([...lines, emptyLine()])}
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
                  {submitting ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
