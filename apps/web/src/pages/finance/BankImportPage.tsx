import { useState, useEffect, useRef } from 'react';
import { Landmark, Upload, RefreshCw, CheckCircle2, Link2 } from 'lucide-react';
import { bankImportApi } from '../../api/bankImport';
import { financeApi } from '../../api/finance';

function parseCSV(text: string): any[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return {
      date: row.date ?? row.txndate ?? row['transaction date'] ?? '',
      description: row.description ?? row.narration ?? row.details ?? '',
      reference: row.reference ?? row.ref ?? row.chequeno ?? '',
      amount: parseFloat(row.amount ?? row.value ?? '0') || 0,
    };
  });
}

export default function BankImportPage() {
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [imports, setImports] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const unwrap = (res: any) => { const d = res.data?.data ?? res.data ?? {}; return d.items ?? d ?? []; };

  const loadImports = () => bankImportApi.listImports().then(r => setImports(unwrap(r))).catch(() => {});

  useEffect(() => {
    financeApi.getBankAccounts({ limit: 200 }).then(r => setBankAccounts(unwrap(r))).catch(() => {});
    loadImports();
  }, []);

  const openImport = (id: string) => {
    setSelected(id);
    bankImportApi.getLines(id).then(r => setLines(unwrap(r))).catch(() => setLines([]));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!bankAccountId) { setMsg('Select a bank account first'); if (fileRef.current) fileRef.current.value = ''; return; }
    const rows = parseCSV(await file.text());
    if (rows.length === 0) { setMsg('No rows parsed from CSV'); return; }
    try {
      await bankImportApi.importRows(bankAccountId, file.name, rows);
      setMsg(`Imported ${rows.length} transactions`);
      loadImports();
    } catch {
      setMsg('Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const autoMatch = async () => {
    if (!selected) return;
    await bankImportApi.autoMatch(selected);
    openImport(selected);
    loadImports();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Bank Statement Import</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Import CSV statements and auto-match to payments &amp; receipts</p>
        </div>
        <div className="flex items-end gap-2">
          <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Select bank account...</option>
            {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name ?? b.accountName ?? b.accountNumber}</option>)}
          </select>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {msg && <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{msg}</div>}

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase">Imports</div>
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {imports.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">No imports yet</div>
            ) : imports.map(imp => (
              <button key={imp.id} onClick={() => openImport(imp.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selected === imp.id ? 'bg-blue-50' : ''}`}>
                <div className="text-sm font-medium text-gray-800 truncate">{imp.fileName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {imp.transactionCount} txns · {imp.matchedCount ?? 0} matched
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase">Statement Lines</span>
            {selected && (
              <button onClick={autoMatch} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium">
                <RefreshCw className="h-3.5 w-3.5" /> Auto Match
              </button>
            )}
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Description</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Ref</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">Select an import to view lines</td></tr>
                ) : lines.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{l.txnDate}</td>
                    <td className="px-4 py-2 text-gray-800">{l.description}</td>
                    <td className="px-4 py-2 text-gray-500">{l.reference ?? '-'}</td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(l.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(l.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {l.status === 'MATCHED' ? (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Matched</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs"><Link2 className="h-3.5 w-3.5" /> Unmatched</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
