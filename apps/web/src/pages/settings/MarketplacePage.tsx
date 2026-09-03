import { useState, useEffect } from 'react';
import { Store, Download, Trash2, Package, AlertTriangle } from 'lucide-react';
import { marketplaceApi } from '../../api/marketplace';

const unwrap = (r: any) => r.data?.data ?? r.data;

export default function MarketplacePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [installed, setInstalled] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlug, setBusySlug] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([marketplaceApi.browse(), marketplaceApi.installed()])
      .then(([l, i]) => { setListings(unwrap(l) ?? []); setInstalled(unwrap(i) ?? []); })
      .catch(() => setError('Could not load the marketplace'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (fn: () => Promise<any>, slug: string) => {
    setBusySlug(slug); setError('');
    try { await fn(); load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Action failed'); }
    finally { setBusySlug(''); }
  };

  const installExt = (listing: any) => {
    const required = (listing.manifest?.settings ?? []).filter((s: any) => s.required);
    const config: Record<string, any> = {};
    for (const s of required) {
      const v = window.prompt(`${listing.name} needs "${s.label ?? s.key}":`);
      if (v == null) return;
      config[s.key] = v;
    }
    act(() => marketplaceApi.install(listing.slug, config), listing.slug);
  };

  const capabilities = (m: any) => [
    m?.customObjects?.length ? `${m.customObjects.length} object${m.customObjects.length > 1 ? 's' : ''}` : null,
    m?.webhooks?.length ? `${m.webhooks.length} webhook${m.webhooks.length > 1 ? 's' : ''}` : null,
    m?.menuItems?.length ? `${m.menuItems.length} menu item${m.menuItems.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Store className="h-6 w-6 text-blue-600" /> Extension Marketplace
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Declarative extensions — custom objects, webhooks, and navigation — installed per tenant and fully reversible
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {listings.length === 0 && (
              <div className="col-span-full p-8 text-center text-gray-400 bg-white rounded-xl border">
                No extensions published yet. Publish one via <code>POST /platform/marketplace/listings</code>.
              </div>
            )}
            {listings.map((l) => (
              <div key={l.slug} className="bg-white rounded-xl border p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-semibold">{l.name}</p>
                      <p className="text-xs text-gray-400">v{l.version} · {l.category}{l.ownListing ? ' · yours' : ''}</p>
                    </div>
                  </div>
                  {l.installed && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Installed {l.installedVersion !== l.version ? `(v${l.installedVersion})` : ''}
                    </span>
                  )}
                </div>
                {l.description && <p className="text-sm text-gray-600">{l.description}</p>}
                <p className="text-xs text-gray-400">{capabilities(l.manifest) || 'No declared capabilities'}</p>
                <div className="mt-auto flex gap-2 pt-2">
                  {!l.installed || l.installedVersion !== l.version ? (
                    <button
                      onClick={() => installExt(l)}
                      disabled={busySlug === l.slug}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" /> {l.installed ? 'Upgrade' : 'Install'}
                    </button>
                  ) : null}
                  {l.installed && (
                    <button
                      onClick={() => act(() => marketplaceApi.uninstall(l.slug), l.slug)}
                      disabled={busySlug === l.slug}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Uninstall
                    </button>
                  )}
                  <span className="ml-auto text-xs text-gray-400 self-center">{l.installCount} install{l.installCount === 1 ? '' : 's'}</span>
                </div>
              </div>
            ))}
          </div>

          {installed.length > 0 && (
            <div className="bg-white rounded-xl border">
              <div className="px-4 py-3 border-b font-medium text-sm">Installed for this tenant</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Extension', 'Version', 'Objects', 'Webhooks', 'Menu', 'Warnings'].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {installed.map((i) => (
                    <tr key={i.slug} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{i.name}</td>
                      <td className="px-4 py-2 text-gray-500">v{i.version}</td>
                      <td className="px-4 py-2 text-gray-500">{i.applied?.customObjectIds?.length ?? 0}</td>
                      <td className="px-4 py-2 text-gray-500">{i.applied?.webhookIds?.length ?? 0}</td>
                      <td className="px-4 py-2 text-gray-500">{(i.applied?.menuItems ?? []).map((m: any) => m.label).join(', ') || '—'}</td>
                      <td className="px-4 py-2 text-amber-600 text-xs">{(i.applied?.warnings ?? []).join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
