import { useState, useEffect } from 'react';
import { Sparkles, Receipt, MessageSquare, BarChart3, FileText } from 'lucide-react';
import { aiSuiteApi } from '../../api/aiSuite';

const unwrap = (res: any) => res.data?.data ?? res.data;

const month = () => new Date().toISOString().slice(0, 7);

function UsageBadge({ label, usage }: { label: string; usage: any }) {
  if (!usage) return null;
  return (
    <span className="text-xs bg-gray-100 rounded-full px-3 py-1">
      {label}: {usage.count}/{usage.quota} used this month
    </span>
  );
}

function ExpenseRiskTab() {
  const [linesJson, setLinesJson] = useState(JSON.stringify([
    { id: '1', merchant: 'Grand Hotel', category: 'LODGING', amount: 900, date: '2026-07-11', hasReceipt: false },
    { id: '2', merchant: 'City Cabs', category: 'TAXI', amount: 45, date: '2026-07-10', hasReceipt: true },
  ], null, 2));
  const [policyJson, setPolicyJson] = useState(JSON.stringify({
    highAmountThreshold: 500, receiptRequiredOver: 100,
    allowedCategories: ['LODGING', 'TAXI', 'MEALS'], categoryCaps: { MEALS: 80 },
  }, null, 2));
  const [result, setResult] = useState<any>(null);
  const [receiptText, setReceiptText] = useState('');
  const [ocr, setOcr] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => { aiSuiteApi.ocrUsage(month()).then(r => setUsage(unwrap(r))).catch(() => undefined); }, []);

  const score = async () => {
    try {
      const res = await aiSuiteApi.scoreClaim({ lines: JSON.parse(linesJson), policy: JSON.parse(policyJson) });
      setResult(unwrap(res));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Invalid JSON or scoring failed');
    }
  };

  const extract = async () => {
    try {
      const res = await aiSuiteApi.ocrExtract({ month: month(), text: receiptText });
      setOcr(unwrap(res));
      aiSuiteApi.ocrUsage(month()).then(r => setUsage(unwrap(r))).catch(() => undefined);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Extraction failed');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Line risk scoring (deterministic)</h3>
        </div>
        <label className="block text-xs text-gray-500">Expense lines (JSON)
          <textarea className="w-full border rounded-lg px-3 py-2 text-xs font-mono mt-1" rows={7} value={linesJson} onChange={e => setLinesJson(e.target.value)} />
        </label>
        <label className="block text-xs text-gray-500">Policy (JSON)
          <textarea className="w-full border rounded-lg px-3 py-2 text-xs font-mono mt-1" rows={5} value={policyJson} onChange={e => setPolicyJson(e.target.value)} />
        </label>
        <button onClick={score} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Score Claim</button>
        {result && (
          <div className="space-y-2">
            <p className="text-sm">Claim risk: <span className={`font-semibold ${result.claimRisk >= 50 ? 'text-red-600' : 'text-green-600'}`}>{result.claimRisk}/100</span> · {result.highRiskCount} high-risk line(s)</p>
            {(result.lines ?? []).map((l: any) => (
              <div key={l.lineId} className="border rounded-lg p-2 text-xs">
                <p className="font-medium">Line {l.lineId} — risk {l.riskScore}</p>
                {(l.flags ?? []).map((f: any) => <p key={f.code} className="text-gray-500">• {f.detail} (+{f.weight})</p>)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Receipt OCR (metered, LLM-backed)</h3>
          <UsageBadge label="OCR" usage={usage} />
        </div>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={7} placeholder="Paste receipt text here…"
          value={receiptText} onChange={e => setReceiptText(e.target.value)} />
        <button onClick={extract} disabled={!receiptText.trim()} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">Extract Fields</button>
        {ocr && (ocr.available
          ? <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(ocr.fields, null, 2)}</pre>
          : <p className="text-sm text-amber-600">{ocr.reason}</p>)}
      </div>
    </div>
  );
}

function SurveyTab() {
  const [text, setText] = useState('Great manager and team spirit.\nWorkload is too high and pay feels below market.\nNo growth opportunities in my role.');
  const [sentiment, setSentiment] = useState<any>(null);
  const [themes, setThemes] = useState<any>(null);

  const analyze = async () => {
    const comments = text.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      const [s, t] = await Promise.all([aiSuiteApi.sentiment(comments), aiSuiteApi.themes(comments)]);
      setSentiment(unwrap(s));
      setThemes(unwrap(t));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Analysis failed');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Open-text comments (one per line)</h3>
        <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={10} value={text} onChange={e => setText(e.target.value)} />
        <button onClick={analyze} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Analyze</button>
      </div>
      <div className="space-y-4">
        {sentiment && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">Sentiment</h3>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(sentiment, null, 2)}</pre>
          </div>
        )}
        {themes && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">Themes</h3>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(themes, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsTab() {
  const [linesJson, setLinesJson] = useState(JSON.stringify([
    { employeeId: 'e1', demographic: 'GROUP_A', performanceRating: 'MEETS', proposedPct: 4 },
    { employeeId: 'e2', demographic: 'GROUP_A', performanceRating: 'MEETS', proposedPct: 4.2 },
    { employeeId: 'e3', demographic: 'GROUP_B', performanceRating: 'MEETS', proposedPct: 2.1 },
    { employeeId: 'e4', demographic: 'GROUP_B', performanceRating: 'MEETS', proposedPct: 2.3 },
  ], null, 2));
  const [out, setOut] = useState<any>(null);

  const run = async () => {
    try {
      const lines = JSON.parse(linesJson);
      const [outliers, bias] = await Promise.all([
        aiSuiteApi.meritOutliers({ lines }),
        aiSuiteApi.biasAlerts({ lines }),
      ]);
      setOut({ outliers: unwrap(outliers), bias: unwrap(bias) });
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Invalid JSON or analysis failed');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Merit worksheet lines (JSON)</h3>
        <textarea className="w-full border rounded-lg px-3 py-2 text-xs font-mono" rows={12} value={linesJson} onChange={e => setLinesJson(e.target.value)} />
        <button onClick={run} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Run Outlier + Bias Screen</button>
      </div>
      <div className="space-y-4">
        {out?.outliers && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">Outliers (z-score within rating group)</h3>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(out.outliers, null, 2)}</pre>
          </div>
        )}
        {out?.bias && (
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">Bias alerts (gap across demographics at equal rating)</h3>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(out.bias, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function RecruitingTab() {
  const [cvText, setCvText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => { aiSuiteApi.cvUsage(month()).then(r => setUsage(unwrap(r))).catch(() => undefined); }, []);

  const parse = async () => {
    try {
      const res = await aiSuiteApi.cvParse({ month: month(), text: cvText });
      setParsed(unwrap(res));
      aiSuiteApi.cvUsage(month()).then(r => setUsage(unwrap(r))).catch(() => undefined);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Parse failed');
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">CV parsing (metered, LLM-backed)</h3>
        <UsageBadge label="CV" usage={usage} />
      </div>
      <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={10} placeholder="Paste CV / resume text here…"
        value={cvText} onChange={e => setCvText(e.target.value)} />
      <button onClick={parse} disabled={!cvText.trim()} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">Parse CV</button>
      {parsed && (parsed.available
        ? <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(parsed.fields, null, 2)}</pre>
        : <p className="text-sm text-amber-600">{parsed.reason}</p>)}
    </div>
  );
}

export default function AiSuitePage() {
  const [tab, setTab] = useState<'expense' | 'survey' | 'insights' | 'recruiting'>('expense');
  const [status, setStatus] = useState<any>(null);

  useEffect(() => { aiSuiteApi.careerStatus().then(r => setStatus(unwrap(r))).catch(() => undefined); }, []);

  const tabs = [
    { key: 'expense' as const, label: 'Expense Intelligence', icon: <Receipt className="h-4 w-4" /> },
    { key: 'survey' as const, label: 'Survey Analytics', icon: <MessageSquare className="h-4 w-4" /> },
    { key: 'insights' as const, label: 'Merit Insights', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'recruiting' as const, label: 'CV Parsing', icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-purple-500" />AI Suite</h1>
        <p className="text-sm text-gray-500">
          Deterministic scoring and analytics always work; LLM-backed extraction lights up when the platform is configured with an API key
          {status && <> — LLM features are currently <span className={status.llmEnabled ?? status.enabled ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{(status.llmEnabled ?? status.enabled) ? 'enabled' : 'not configured'}</span></>}.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'expense' && <ExpenseRiskTab />}
      {tab === 'survey' && <SurveyTab />}
      {tab === 'insights' && <InsightsTab />}
      {tab === 'recruiting' && <RecruitingTab />}
    </div>
  );
}
