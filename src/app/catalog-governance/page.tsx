'use client';
import { useEffect, useState } from 'react';

type LifecycleState = 'draft' | 'active' | 'deprecated' | 'retired' | 'removed';
type ApprovalTier   = 'tier_1' | 'tier_2' | 'tier_3';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

interface Overview {
  total_items: number; active: number; deprecated: number; retired: number;
  stale_items: number; orphaned_items: number; pending_changes: number;
  pending_tier_1: number; pending_tier_2: number; pending_tier_3: number;
}
interface Approver { name: string; role: string; status: string; }
interface ChangeRequest {
  id: string; item_id: string; item_name: string;
  change_class: string; approval_tier: ApprovalTier; status: ApprovalStatus;
  requested_by: string; requested_at: string; summary: string;
  fields_changed: string[]; approvers: Approver[];
  retirement_reason?: string;
}
interface CatalogItem {
  id: string; service_name: string; service_owner: string; fulfillment_owner: string;
  domain: string; category: string; description: string; consumer: string; sla: string;
  lifecycle_state: LifecycleState; review_date: string;
  replacement_item: string | null; dependency_refs: string[];
  created_at: string; updated_at: string;
}

const STATE_COLOR: Record<LifecycleState, string> = {
  draft:      'bg-blue-100 text-blue-800',
  active:     'bg-green-100 text-green-800',
  deprecated: 'bg-amber-100 text-amber-800',
  retired:    'bg-red-100 text-red-800',
  removed:    'bg-gray-100 text-gray-500',
};
const TIER_COLOR: Record<ApprovalTier, string> = {
  tier_1: 'bg-green-100 text-green-800',
  tier_2: 'bg-amber-100 text-amber-800',
  tier_3: 'bg-red-100 text-red-800',
};
const TIER_LABEL: Record<ApprovalTier, string> = {
  tier_1: 'T1 – Owner only', tier_2: 'T2 – Domain', tier_3: 'T3 – Governance',
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function CatalogGovernancePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items,    setItems]    = useState<CatalogItem[]>([]);
  const [changes,  setChanges]  = useState<ChangeRequest[]>([]);
  const [tab,      setTab]      = useState<'dashboard' | 'items' | 'changes' | 'new_change'>('dashboard');
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({ item_id:'svc-001', item_name:'WorkFamilyAI Intake', change_class:'standard', requested_by:'', summary:'', fields_changed:'' });
  const [formResult, setFormResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/catalog-governance?action=overview').then(r => r.json()),
      fetch('/api/catalog-governance?action=items').then(r => r.json()),
      fetch('/api/catalog-governance?action=changes').then(r => r.json()),
    ]).then(([ov, it, ch]) => {
      setOverview(ov);
      setItems(it.items ?? []);
      setChanges(ch.changes ?? []);
      setLoading(false);
    });
  }, []);

  async function submitChange(e: React.FormEvent) {
    e.preventDefault();
    const body = { action: 'create_change', ...form, fields_changed: form.fields_changed.split(',').map(s => s.trim()) };
    const res  = await fetch('/api/catalog-governance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    setFormResult(JSON.stringify(data.change_request, null, 2));
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading…</div>;

  const TABS = [
    { key: 'dashboard',  label: 'Dashboard' },
    { key: 'items',      label: 'Catalog Items' },
    { key: 'changes',    label: `Changes (${changes.filter(c=>c.status==='pending').length} pending)` },
    { key: 'new_change', label: '+ New Change' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-4">
        <svg className="w-8 h-8 text-teal-700" viewBox="0 0 64 64" fill="none" aria-hidden>
          <rect x="8" y="10" width="48" height="44" rx="12" stroke="currentColor" strokeWidth="4"/>
          <path d="M20 24h24M20 32h16M20 40h28" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        </svg>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Service Catalog Governance</h1>
          <p className="text-xs text-gray-500">Ownership · Approvals · Lifecycle · Retirement</p>
        </div>
      </header>

      <nav className="border-b border-gray-200 bg-white px-6">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}>{t.label}</button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {tab === 'dashboard' && overview && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold">Catalog health</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Total items',      val: overview.total_items,    color: 'bg-gray-100' },
                { label: 'Active',           val: overview.active,         color: 'bg-green-50' },
                { label: 'Deprecated',       val: overview.deprecated,     color: 'bg-amber-50' },
                { label: 'Stale (overdue)',  val: overview.stale_items,    color: 'bg-red-50'   },
                { label: 'Orphaned',         val: overview.orphaned_items, color: 'bg-red-50'   },
              ].map(k => (
                <div key={k.label} className={`rounded-xl p-5 border border-gray-200 ${k.color}`}>
                  <div className="text-3xl font-extrabold">{k.val}</div>
                  <div className="text-xs text-gray-500 mt-1">{k.label}</div>
                </div>
              ))}
            </div>
            <h2 className="text-lg font-bold pt-2">Pending approvals by tier</h2>
            <div className="grid grid-cols-3 gap-4">
              {([
                { tier: 'tier_1', label: 'Tier 1 — Owner only', val: overview.pending_tier_1 },
                { tier: 'tier_2', label: 'Tier 2 — Domain',     val: overview.pending_tier_2 },
                { tier: 'tier_3', label: 'Tier 3 — Governance', val: overview.pending_tier_3 },
              ] as const).map(k => (
                <div key={k.tier} className={`rounded-xl p-5 border border-gray-200 ${k.val > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className="text-3xl font-extrabold">{k.val}</div>
                  <div className="text-xs text-gray-500 mt-1">{k.label}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-amber-800 mb-2">Governance rules</h3>
              <ul className="text-sm text-amber-900 space-y-1 list-disc list-inside">
                <li>Every active item must have a service owner and fulfillment owner.</li>
                <li>Items past their review date need a confirmed review or deprecation decision.</li>
                <li>Tier 3 changes require governance board and risk assurance approval.</li>
                <li>Never retire an active item — deprecate first, then retire after dependency clearance.</li>
                <li>Rows before systems: a problem creates a change request, not a new service.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === 'items' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">All catalog items</h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-gray-600">
                  <tr>{['Service','Domain','Owner','Fulfiller','SLA','State','Review date','Deps'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const overdue = new Date(item.review_date) < new Date() && item.lifecycle_state === 'active';
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{item.service_name}</td>
                        <td className="px-4 py-3 text-gray-500">{item.domain}</td>
                        <td className="px-4 py-3">{item.service_owner.split('@')[0]}</td>
                        <td className="px-4 py-3 text-gray-500">{item.fulfillment_owner}</td>
                        <td className="px-4 py-3">{item.sla}</td>
                        <td className="px-4 py-3"><Badge label={item.lifecycle_state} cls={STATE_COLOR[item.lifecycle_state]} /></td>
                        <td className={`px-4 py-3 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {item.review_date}{overdue ? ' ⚠' : ''}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{item.dependency_refs.length ? item.dependency_refs.join(', ') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'changes' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Change requests</h2>
            <div className="space-y-4">
              {changes.map(cr => (
                <div key={cr.id} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{cr.item_name}</span>
                    <Badge label={TIER_LABEL[cr.approval_tier]} cls={TIER_COLOR[cr.approval_tier]} />
                    <Badge label={cr.status} cls={
                      cr.status === 'pending'  ? 'bg-amber-100 text-amber-800' :
                      cr.status === 'approved' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    } />
                    <span className="text-xs text-gray-400 ml-auto">{cr.id} · {cr.requested_at.slice(0,10)}</span>
                  </div>
                  <p className="text-sm text-gray-600">{cr.summary}</p>
                  {cr.retirement_reason && (
                    <p className="text-xs text-red-700 bg-red-50 rounded p-2">Retirement reason: {cr.retirement_reason}</p>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Approvers</p>
                    <div className="flex flex-wrap gap-2">
                      {cr.approvers.map(a => (
                        <span key={a.role} className={`text-xs rounded-full px-2 py-1 border ${
                          a.status === 'approved' ? 'border-green-300 bg-green-50 text-green-700' :
                          a.status === 'rejected' ? 'border-red-300 bg-red-50 text-red-700' :
                          'border-gray-200 bg-gray-50 text-gray-500'
                        }`}>{a.name} · {a.status}</span>
                      ))}
                    </div>
                  </div>
                  {cr.fields_changed.length > 0 && (
                    <p className="text-xs text-gray-400">Fields: {cr.fields_changed.join(', ')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'new_change' && (
          <div className="max-w-lg space-y-5">
            <h2 className="text-lg font-bold">Create a change request</h2>
            <form onSubmit={submitChange} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              {[
                { id: 'item_id',        label: 'Item ID',                          type: 'text',  required: true  },
                { id: 'item_name',      label: 'Item name',                        type: 'text',  required: true  },
                { id: 'requested_by',   label: 'Requested by (email)',             type: 'email', required: true  },
                { id: 'summary',        label: 'Change summary',                   type: 'text',  required: true  },
                { id: 'fields_changed', label: 'Fields changed (comma-separated)', type: 'text',  required: false },
              ].map(f => (
                <div key={f.id}>
                  <label htmlFor={f.id} className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input id={f.id} type={f.type} required={f.required}
                    value={(form as Record<string,string>)[f.id]}
                    onChange={e => setForm(prev => ({ ...prev, [f.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Change class</label>
                <select value={form.change_class} onChange={e => setForm(prev => ({ ...prev, change_class: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="metadata">Metadata — Tier 1 (owner only)</option>
                  <option value="standard">Standard — Tier 2 (owner + domain)</option>
                  <option value="high_risk">High risk — Tier 3 (governance + risk)</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-teal-700 hover:bg-teal-800 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
                Create change request
              </button>
            </form>
            {formResult && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Change request created:</p>
                <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">{formResult}</pre>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
