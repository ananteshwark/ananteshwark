import { useState, useEffect } from 'react';
import { securityApi } from '../../api/security';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function MfaTab() {
  const [enroll, setEnroll] = useState<any>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<boolean | null>(null);
  async function doEnroll() { try { const r = await securityApi.enrollMfa(); setEnroll(r.data?.data ?? r.data); setVerified(null); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function doVerify() { try { const r = await securityApi.verifyMfa(code, new Date().toISOString()); setVerified((r.data?.data ?? r.data).verified); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3 max-w-lg">
      <button onClick={doEnroll} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Enroll TOTP</button>
      {enroll && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm">Scan in Google Authenticator, or use the secret:</p>
          <code className="text-xs bg-gray-100 px-2 py-1 rounded block break-all">{enroll.secret}</code>
          <p className="text-[10px] text-gray-400 break-all">{enroll.otpauthUri}</p>
          <div className="flex gap-2 items-end">
            <input placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <button onClick={doVerify} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Verify</button>
          </div>
          {verified != null && <p className={`text-sm ${verified ? 'text-green-600' : 'text-red-600'}`}>{verified ? '✓ MFA activated' : '✗ Invalid code'}</p>}
        </div>
      )}
    </div>
  );
}

function IpTab() {
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState({ cidr: '', label: '' });
  const [checkIp, setCheckIp] = useState('203.0.113.5');
  const [checkResult, setCheckResult] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { setList(unwrap(await securityApi.listAllowlist())); }
  async function add(e: React.FormEvent) { e.preventDefault(); try { await securityApi.addAllowlist(form); setForm({ cidr: '', label: '' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function check() { try { const r = await securityApi.ipCheck(checkIp); setCheckResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="CIDR (e.g. 203.0.113.0/24)" value={form.cidr} onChange={(e) => setForm({ ...form, cidr: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Allow</button>
      </form>
      <div className="flex gap-2 items-end">
        <input value={checkIp} onChange={(e) => setCheckIp(e.target.value)} className="border rounded px-2 py-1 text-sm font-mono" />
        <button onClick={check} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Check IP</button>
        {checkResult && <span className={`text-sm ${checkResult.allowed ? 'text-green-600' : 'text-red-600'}`}>{checkResult.allowed ? `allowed (${checkResult.matched ?? 'no rules'})` : 'blocked'}</span>}
      </div>
      <ul className="border rounded-lg divide-y text-sm">
        {list.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No allowlist rules (all IPs allowed).</li> : list.map((e) => <li key={e.id} className="px-3 py-2 flex justify-between"><span className="font-mono text-xs">{e.cidr}</span><span className="text-gray-400">{e.label}</span></li>)}
      </ul>
    </div>
  );
}

function SessionsTab() {
  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => { load(); }, []);
  async function load() { setSessions(unwrap(await securityApi.listSessions())); }
  async function seed() {
    try { await securityApi.recordSession({ userId: 'demo-user', ipAddress: '9.9.9.9', userAgent: 'Chrome', at: new Date().toISOString() }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function revoke(id: string) { try { await securityApi.revokeSession(id); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      <button onClick={seed} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Record Demo Session</button>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">User</th><th className="px-3 py-2 text-left">IP</th><th className="px-3 py-2 text-left">Anomalies</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {sessions.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No active sessions.</td></tr> : sessions.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 font-mono text-xs">{s.userId}</td>
              <td className="px-3 py-2 font-mono text-xs">{s.ipAddress}</td>
              <td className="px-3 py-2">{(s.anomalyFlags ?? []).map((f: string) => <span key={f} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded mr-1">{f}</span>)}</td>
              <td className="px-3 py-2 text-right"><button onClick={() => revoke(s.id)} className="text-red-500 text-xs hover:underline">force logout</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EncryptTab() {
  const [value, setValue] = useState('123-45-6789');
  const [token, setToken] = useState('');
  const [decrypted, setDecrypted] = useState('');
  async function enc() { try { const r = await securityApi.encrypt(value); setToken((r.data?.data ?? r.data).token); setDecrypted(''); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function dec() { try { const r = await securityApi.decrypt(token); setDecrypted((r.data?.data ?? r.data).value); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex gap-2 items-end">
        <input value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm" />
        <button onClick={enc} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Encrypt</button>
      </div>
      {token && <code className="text-xs bg-gray-100 px-2 py-1 rounded block break-all">{token}</code>}
      {token && <button onClick={dec} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Decrypt</button>}
      {decrypted && <p className="text-sm">Decrypted: <strong>{decrypted}</strong></p>}
    </div>
  );
}

const TABS = ['MFA (TOTP)', 'IP Allowlist', 'Sessions', 'Field Encryption'];

export default function SecurityPage() {
  const [tab, setTab] = useState('MFA (TOTP)');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Security Hardening</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Cloud Security parity — TOTP multi-factor auth, per-tenant IP allowlisting (CIDR), session
          monitoring with anomaly detection and force-logout, and per-tenant field-level encryption.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'MFA (TOTP)' && <MfaTab />}
      {tab === 'IP Allowlist' && <IpTab />}
      {tab === 'Sessions' && <SessionsTab />}
      {tab === 'Field Encryption' && <EncryptTab />}
    </div>
  );
}
