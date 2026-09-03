import { useState, useEffect } from 'react';
import { Plus, X, Search, BookOpen, ThumbsUp, ThumbsDown, Archive, Send } from 'lucide-react';
import { knowledgeApi } from '../../api/knowledge';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PUBLISHED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
};

function ArticleModal({ categories, onClose, onDone }: { categories: any[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: '', body: '', categoryId: '', tags: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await knowledgeApi.createArticle({
        title: form.title, body: form.body,
        categoryId: form.categoryId || undefined,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create article');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Article</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Title"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="border rounded-lg px-3 py-2 text-sm" value={form.categoryId}
              onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Tags, comma separated"
              value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} />
          </div>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={10} placeholder="Article body (Markdown or plain text)"
            value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim() || !form.body.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [intake, setIntake] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = async () => {
    const [cats, arts, mails] = await Promise.all([
      knowledgeApi.listCategories().catch(() => null),
      knowledgeApi.listArticles(categoryFilter ? { categoryId: categoryFilter } : undefined).catch(() => null),
      knowledgeApi.listEmailIntake().catch(() => null),
    ]);
    if (cats) setCategories(listOf(cats));
    if (arts) setArticles(listOf(arts));
    if (mails) setIntake(listOf(mails).filter((m: any) => m.status === 'PENDING'));
  };

  useEffect(() => { load(); }, [categoryFilter]);

  const runSearch = async () => {
    if (!query.trim()) { setResults(null); return; }
    const res = await knowledgeApi.search(query);
    setResults(listOf(res));
  };

  const openArticle = async (a: any) => {
    setSelected(a);
    knowledgeApi.recordView(a.id).catch(() => undefined);
  };

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
      if (selected) {
        const fresh = await knowledgeApi.getArticle(selected.id).catch(() => null);
        if (fresh) setSelected(unwrap(fresh));
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const addCategory = async () => {
    const name = prompt('Category name');
    if (!name?.trim()) return;
    await act(() => knowledgeApi.createCategory({ name }), 'add category');
  };

  const shown = results ?? articles;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5" />Knowledge Base</h1>
          <p className="text-sm text-gray-500">Author, publish and search internal articles; convert inbound emails into drafts.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus className="h-4 w-4" />New Article
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 border rounded-lg px-3 py-2 bg-white flex-1 min-w-64">
          <Search className="h-4 w-4 text-gray-400" />
          <input className="flex-1 text-sm outline-none" placeholder="Search published articles…"
            value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
          {results && <button onClick={() => { setResults(null); setQuery(''); }}><X className="h-4 w-4 text-gray-400" /></button>}
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm bg-white" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={addCategory} className="px-3 py-2 border rounded-lg text-sm">+ Category</button>
      </div>

      {intake.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Email intake — pending review</h3>
          <ul className="space-y-1">
            {intake.map(m => (
              <li key={m.id} className="flex items-center justify-between text-sm text-blue-900">
                <span className="truncate">{m.subject} <span className="text-blue-500">from {m.fromAddress ?? m.from}</span></span>
                <span className="space-x-2 shrink-0">
                  <button onClick={() => act(() => knowledgeApi.convertEmail(m.id), 'convert email')} className="text-blue-700 text-xs underline">Convert to draft</button>
                  <button onClick={() => act(() => knowledgeApi.ignoreEmail(m.id), 'ignore email')} className="text-gray-500 text-xs underline">Ignore</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border divide-y max-h-[70vh] overflow-y-auto">
          {shown.length === 0 && <p className="p-4 text-sm text-gray-400">{results ? 'No matches.' : 'No articles yet.'}</p>}
          {shown.map((row: any) => {
            const a = row.article ?? row;
            return (
              <button key={a.id} onClick={() => openArticle(a)}
                className={`w-full text-left p-3 hover:bg-gray-50 ${selected?.id === a.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{a.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[a.status] ?? ''}`}>{a.status}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {a.views ?? 0} views · {(a.tags ?? []).join(', ') || 'no tags'}{row.score != null ? ` · score ${row.score}` : ''}
                </p>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          {!selected && <p className="text-sm text-gray-400 text-center py-16">Select an article to read it.</p>}
          {selected && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{selected.title}</h2>
                  <p className="text-xs text-gray-500 mt-1">v{selected.version} · {selected.status} · {selected.views ?? 0} views · 👍 {selected.helpfulVotes ?? 0} / 👎 {selected.notHelpfulVotes ?? 0}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {selected.status === 'DRAFT' && (
                    <button onClick={() => act(() => knowledgeApi.publishArticle(selected.id), 'publish')}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm flex items-center gap-1"><Send className="h-3.5 w-3.5" />Publish</button>
                  )}
                  {selected.status === 'PUBLISHED' && (
                    <button onClick={() => act(() => knowledgeApi.archiveArticle(selected.id), 'archive')}
                      className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1"><Archive className="h-3.5 w-3.5" />Archive</button>
                  )}
                </div>
              </div>
              <div className="prose prose-sm max-w-none mt-4 whitespace-pre-wrap text-sm text-gray-700">{selected.body}</div>
              {selected.status === 'PUBLISHED' && (
                <div className="mt-6 pt-4 border-t flex items-center gap-3 text-sm text-gray-500">
                  Was this helpful?
                  <button onClick={() => act(() => knowledgeApi.vote(selected.id, true), 'vote')} className="flex items-center gap-1 text-green-600"><ThumbsUp className="h-4 w-4" />Yes</button>
                  <button onClick={() => act(() => knowledgeApi.vote(selected.id, false), 'vote')} className="flex items-center gap-1 text-red-500"><ThumbsDown className="h-4 w-4" />No</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && <ArticleModal categories={categories} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
