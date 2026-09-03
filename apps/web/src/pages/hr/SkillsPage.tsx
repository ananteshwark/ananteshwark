import { useState, useEffect } from 'react';
import { skillsApi } from '../../api/skills';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function TaxonomyTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [skillForm, setSkillForm] = useState({ categoryId: '', name: '', maxProficiency: 5 });
  const [editSkillId, setEditSkillId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setCategories(unwrap(await skillsApi.listCategories()));
    setSkills(unwrap(await skillsApi.listSkills()));
  }
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editCatId) await skillsApi.updateCategory(editCatId, catForm);
      else await skillsApi.createCategory(catForm);
      setCatForm({ name: '', description: '' }); setEditCatId(null); load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  function editCat(c: any) { setEditCatId(c.id); setCatForm({ name: c.name ?? '', description: c.description ?? '' }); }
  async function addSkill(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editSkillId) await skillsApi.updateSkill(editSkillId, skillForm);
      else await skillsApi.createSkill(skillForm);
      setSkillForm({ categoryId: '', name: '', maxProficiency: 5 }); setEditSkillId(null); load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  function editSkill(s: any) { setEditSkillId(s.id); setSkillForm({ categoryId: s.categoryId ?? '', name: s.name ?? '', maxProficiency: s.maxProficiency ?? 5 }); }
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Categories</h3>
        <form onSubmit={addCat} className="flex gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div className="flex-1"><label className="text-xs text-gray-500">Name</label><input required value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">{editCatId ? 'Save' : '+ Category'}</button>
          {editCatId && <button type="button" onClick={() => { setEditCatId(null); setCatForm({ name: '', description: '' }); }} className="border px-3 py-1.5 rounded text-sm">Cancel</button>}
        </form>
        <ul className="border rounded-lg divide-y text-sm">
          {categories.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No categories.</li> : categories.map((c) => <li key={c.id} className="px-3 py-2 font-medium flex items-center justify-between"><span>{c.name}</span><button onClick={() => editCat(c)} className="text-xs text-indigo-600 hover:underline">Edit</button></li>)}
        </ul>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Catalog Skills</h3>
        <form onSubmit={addSkill} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Category</label><select required value={skillForm.categoryId} onChange={(e) => setSkillForm({ ...skillForm, categoryId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Skill</label><input required value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">{editSkillId ? 'Save' : '+ Skill'}</button>
          {editSkillId && <button type="button" onClick={() => { setEditSkillId(null); setSkillForm({ categoryId: '', name: '', maxProficiency: 5 }); }} className="border px-3 py-1.5 rounded text-sm">Cancel</button>}
        </form>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Skill</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-right">Max</th><th className="px-3 py-2"></th></tr></thead>
          <tbody className="divide-y">
            {skills.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No skills.</td></tr> : skills.map((s) => (
              <tr key={s.id}><td className="px-3 py-2 font-medium">{s.name}</td><td className="px-3 py-2 text-xs">{catName(s.categoryId)}</td><td className="px-3 py-2 text-right">{s.maxProficiency}</td><td className="px-3 py-2 text-right"><button onClick={() => editSkill(s)} className="text-xs text-indigo-600 hover:underline">Edit</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileTab() {
  const [employeeId, setEmployeeId] = useState('');
  const [skills, setSkills] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [form, setForm] = useState({ skillId: '', proficiency: 1 });

  async function load() {
    if (!employeeId) return;
    setSkills(unwrap(await skillsApi.listEmployeeSkills(employeeId)));
    setCatalog(unwrap(await skillsApi.listSkills()));
  }
  async function assign(e: React.FormEvent) {
    e.preventDefault();
    try { await skillsApi.assignSkill({ employeeId, ...form }); setForm({ skillId: '', proficiency: 1 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  const skillName = (id: string) => catalog.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Employee ID</label><input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-72 border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load</button>
      </div>
      {employeeId && (
        <form onSubmit={assign} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Skill</label><select required value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">—</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Proficiency (1–5)</label><input type="number" min={1} max={5} value={form.proficiency} onChange={(e) => setForm({ ...form, proficiency: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Assign</button>
        </form>
      )}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Skill</th><th className="px-3 py-2 text-right">Proficiency</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {skills.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No skills assigned.</td></tr> : skills.map((s) => (
            <tr key={s.id}><td className="px-3 py-2 font-medium">{skillName(s.skillId)}</td><td className="px-3 py-2 text-right">{s.proficiency}</td><td className="px-3 py-2 text-right"><button onClick={async () => { await skillsApi.removeEmployeeSkill(s.id); load(); }} className="text-red-500 text-xs hover:underline">remove</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapTab() {
  const [form, setForm] = useState({ employeeId: '', jobId: '' });
  const [gap, setGap] = useState<any>(null);
  const [recs, setRecs] = useState<any>(null);

  async function run() {
    if (!form.employeeId || !form.jobId) return;
    try {
      const g = await skillsApi.gapAnalysis(form.employeeId, form.jobId);
      setGap(g.data?.data ?? g.data);
      const r = await skillsApi.recommendLearning(form.employeeId, form.jobId);
      setRecs(r.data?.data ?? r.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-3 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Employee ID</label><input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Job / Role ID</label><input value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Analyze</button>
      </div>
      {gap && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span>Readiness: <strong>{Math.round((gap.readiness ?? 0) * 100)}%</strong></span>
            <span>Met: <strong>{gap.met}/{gap.total}</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Skill</th><th className="px-3 py-2 text-right">Required</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Gap</th></tr></thead>
            <tbody className="divide-y">
              {(gap.gaps ?? []).length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-green-600">No gaps — fully qualified.</td></tr> : gap.gaps.map((g: any) => (
                <tr key={g.skillId}><td className="px-3 py-2 font-medium">{g.skillName}</td><td className="px-3 py-2 text-right">{g.required}</td><td className="px-3 py-2 text-right">{g.current}</td><td className="px-3 py-2 text-right font-bold text-red-600">{g.gap}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {recs && recs.recommendations?.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Recommended Learning</h3>
          {recs.recommendations.map((r: any) => (
            <div key={r.skillId} className="border rounded-lg p-3">
              <p className="text-sm font-medium">{r.skillName} <span className="text-xs text-gray-400">(gap {r.gap})</span></p>
              <ul className="mt-1 text-sm list-disc list-inside text-gray-600">
                {r.courses.map((c: any) => <li key={c.courseId}>{c.code} — {c.title} ({c.durationHours}h)</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = ['Taxonomy', 'Employee Profile', 'Gap Analysis'];

export default function SkillsPage() {
  const [tab, setTab] = useState('Taxonomy');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Skills & Workforce Intelligence</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Dynamic Skills parity — skills taxonomy (categories + 1–5 catalog), employee skill
          profiles, job-requirement gap analysis, and AI-suggested learning to close gaps.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Taxonomy' && <TaxonomyTab />}
      {tab === 'Employee Profile' && <ProfileTab />}
      {tab === 'Gap Analysis' && <GapTab />}
    </div>
  );
}
