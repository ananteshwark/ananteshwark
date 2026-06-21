import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { taxApi } from '../../api/tax';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Card, CardContent } from '../../components/ui/Card';

const STATUS_VARIANT: Record<string, any> = {
  DRAFT: 'default',
  POSTED: 'info',
  PAID: 'success',
  CANCELLED: 'error',
};

interface BillForm {
  billNumber: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  subTotal: string;
  taxCodeId: string;
  notes: string;
}

const emptyForm = (): BillForm => ({
  billNumber: '',
  vendorName: '',
  billDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  subTotal: '',
  taxCodeId: '',
  notes: '',
});

function TaxPreview({ taxCodeId, subTotal }: { taxCodeId: string; subTotal: string }) {
  const amount = parseFloat(subTotal);
  const { data } = useQuery({
    queryKey: ['taxPreview', taxCodeId, amount],
    queryFn: () =>
      taxApi.calculate(taxCodeId, amount).then((r) => r.data?.data ?? r.data),
    enabled: !!taxCodeId && !isNaN(amount) && amount > 0,
  });

  if (!taxCodeId || !subTotal || isNaN(amount) || amount <= 0) return null;
  if (!data) return <p className="text-xs text-gray-400 mt-1">Calculating...</p>;

  const lines: any[] = Array.isArray(data) ? data : [];
  return (
    <div className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
      Tax breakdown: {lines.map((l) => `${l.componentName} ₹${l.taxAmount}`).join(' + ')}
    </div>
  );
}

function BillModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BillForm>(emptyForm());

  useEffect(() => {
    if (isOpen) setForm(emptyForm());
  }, [isOpen]);

  const { data: taxCodesRaw } = useQuery({
    queryKey: ['taxCodes'],
    queryFn: () => taxApi.listCodes().then((r) => r.data?.data ?? r.data),
  });
  const taxCodes: any[] = Array.isArray(taxCodesRaw) ? taxCodesRaw : [];

  const createMut = useMutation({
    mutationFn: (data: any) =>
      apiClient.post('/finance/ap/bills', data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Bill created');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create bill'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      ...form,
      subTotal: parseFloat(form.subTotal),
      taxCodeId: form.taxCodeId || undefined,
      dueDate: form.dueDate || undefined,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Bill" size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Bill Number"
            value={form.billNumber}
            onChange={(e) => setForm({ ...form, billNumber: e.target.value })}
            required
          />
          <Input
            label="Vendor Name"
            value={form.vendorName}
            onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Bill Date"
            type="date"
            value={form.billDate}
            onChange={(e) => setForm({ ...form, billDate: e.target.value })}
            required
          />
          <Input
            label="Due Date"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>

        <div>
          <Input
            label="Sub Total (₹)"
            type="number"
            min={0}
            step={0.01}
            value={form.subTotal}
            onChange={(e) => setForm({ ...form, subTotal: e.target.value })}
            required
          />
        </div>

        <div>
          <Select
            label="Tax Code"
            value={form.taxCodeId}
            onChange={(e) => setForm({ ...form, taxCodeId: e.target.value })}
            options={taxCodes.map((tc) => ({ value: tc.id, label: `${tc.code} — ${tc.name} (${tc.rate}%)` }))}
            placeholder="None / No Tax"
          />
          <TaxPreview taxCodeId={form.taxCodeId} subTotal={form.subTotal} />
        </div>

        <Input
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Optional notes"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={createMut.isPending}>Create Bill</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function BillsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: () => apiClient.get('/finance/ap/bills').then((r) => r.data?.data ?? r.data),
  });
  const bills: any[] = Array.isArray(rawData) ? rawData : [];

  const postMut = useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/finance/ap/bills/${id}/post`).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success('Bill posted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to post'),
  });

  const fmt = (v: any) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v));

  return (
    <div>
      <PageHeader
        title="Bills"
        description="Accounts Payable — manage vendor bills"
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            New Bill
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-10 text-gray-500">Loading...</div>
          ) : bills.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No bills yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bill #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Sub Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Tax</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b: any) => (
                    <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-900">{b.billNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{b.vendorName}</td>
                      <td className="px-4 py-3 text-gray-500">{b.billDate ? new Date(b.billDate).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(b.subTotal)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{fmt(b.taxAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(b.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[b.status] || 'default'}>{b.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {b.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Send className="h-3 w-3" />}
                            onClick={() => postMut.mutate(b.id)}
                            loading={postMut.isPending}
                          >
                            Post
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <BillModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
