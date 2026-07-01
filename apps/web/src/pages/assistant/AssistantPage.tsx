import { useState } from 'react';
import { assistantApi } from '../../api/assistant';

// Demo context the bot narrates from (in a real deployment these come from live queries).
const DEMO_CONTEXT = {
  pendingApprovals: 3,
  leaveBalance: 12,
  latestPayslipPeriod: '2026-06',
  overdueArAmount: '₹2,45,000',
  overdueArCount: 4,
  cashPosition: '₹1.2M',
  expenseStatus: 'APPROVED',
};

const SUGGESTIONS = [
  'What are my pending approvals?',
  "What's my leave balance?",
  'Download my payslip',
  'Show overdue invoices',
  'What is my cash position?',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'bot'; text: string; intent?: string; action?: any }>>([
    { role: 'bot', text: 'Hi! Ask me about approvals, leave, payslips, overdue invoices, cash position, or expenses.' },
  ]);
  const [input, setInput] = useState('');

  async function send(utterance: string) {
    if (!utterance.trim()) return;
    setMessages((m) => [...m, { role: 'user', text: utterance }]);
    setInput('');
    try {
      const r = await assistantApi.chat(utterance, DEMO_CONTEXT);
      const d = r.data?.data ?? r.data;
      setMessages((m) => [...m, { role: 'bot', text: d.response, intent: d.intent, action: d.action }]);
    } catch (err: any) {
      setMessages((m) => [...m, { role: 'bot', text: err.response?.data?.message ?? 'Something went wrong.' }]);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Digital Assistant</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Digital Assistant parity — a conversational bot that classifies ERP intents and answers about
          approvals, leave, payslips, overdue AR, and cash position in natural language.
        </p>
      </div>
      <div className="border rounded-lg h-[26rem] overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>
              {m.text}
              {m.intent && <div className="text-[10px] opacity-60 mt-1">intent: {m.intent}</div>}
              {m.action && <button className="mt-1 text-xs bg-green-600 text-white px-2 py-0.5 rounded">{m.action.type.replace(/_/g, ' ')}{m.action.count ? ` (${m.action.count})` : ''}</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="text-xs border rounded-full px-3 py-1 hover:bg-gray-100">{s}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask something…" className="flex-1 border rounded px-3 py-2 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm">Send</button>
      </form>
    </div>
  );
}
