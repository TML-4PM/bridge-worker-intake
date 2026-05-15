'use client';
import { useEffect, useState } from 'react';

// ----------------------------------------------------------------
// TYPES (inline subset — lib types used at runtime via API)
// ----------------------------------------------------------------
type Lifecycle = 'idea' | 'beta' | 'ga' | 'deprecated' | 'retired';
type RiskTier = 'low' | 'medium' | 'high' | 'critical';

interface Violation { rule_id: string; message: string; field?: string; }
interface IFADSHook { code: string; trigger: string; severity: string; }
interface EvidenceRef { id: string; label: string; verified: boolean; }
interface ServiceItem {
  id: string; name: string; description: string; owner_team: string;
  population: string; research_lines: string[]; evidence: EvidenceRef[];
  ifads_hooks: IFADSHook[]; risk_tier: RiskTier; lifecycle: Lifecycle;
  backed_by_evidence: boolean; violations: Violation[];
  auto_risk_tier: RiskTier; updated_at: string;
}
interface ChangeRequest {
  id: string; service_id: string; intent: string; change_type: string;
  status: string; submitted_by: string; submitted_at: string;
  risk_tier: RiskTier; old_values?: Record<string,unknown>; new_values: Record<string,unknown>;
}
interface Overview {
  total: number; by_lifecycle: Record<string,number>;
  missing_owner: number; missing_evidence: number; missing_ifads: number;
  policy_violations: number; pending_changes: number;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const LIFECYCLE_ORDER: Lifecycle[] = ['idea','beta','ga','deprecated','retired'];
const LIFECYCLE_COLOUR: Record<Lifecycle,string> = {
  idea:'bg-gray-100 text-gray-600',
  beta:'bg-blue-100 text-blue-700',
  ga:'bg-green-100 text-green-700',
  deprecated:'bg-yellow-100 text-yellow-700',
  retired:'bg-red-100 text-red-600',
};
const RISK_COLOUR: Record<RiskTier,string> = {
  low:'bg-green-50 text-green-700',
  medium:'bg-yellow-50 text-yellow-700',
  high:'bg-orange-100 text-orange-700',
  critical:'bg-red-100 text-red-700 font-semibold',
};
const RL_LABELS: Record<string,string> = {
  'RL-01':'Digital interaction effects','RL-02':'Human difference + AI',
  'RL-03':'AI suitability','RL-04':'Signal quality','RL-05':'Consent + trust',
  'RL-06':'Human-machine comms','RL-07':'Org adaptation',
  'RL-08':'Support + participation','RL-09':'Biological signal pathways',
};

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function Badge({ label, colour }: { label: string; colour: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{label}</span>;
}
function KPI({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${alert && value > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ----------------------------------------------------------------
// NEW CHANGE FORM
// ----------------------------------------------------------------
function NewChangeForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    service_id:'', intent:'', reason:'', impact:'', change_type:'modify',
    population:'', research_lines:'' as string, risk_tier:'low' as RiskTier,
    harm_description:'', ifads_code:'intent_drift',
  });
  const [result, setResult] = useState<null | { accepted?: boolean; valid?: boolean; violations?: Violation[]; change_id?: string }>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await fetch('/api/catalog-governance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change_request',
        change_request: {
          service_id: form.service_id,
          intent: form.intent,
          reason: form.reason,
          impact: form.impact,
          change_type: form.change_type,
          risk_tier: form.risk_tier,
          new_values: {
            population: form.population,
            research_lines: form.research_lines.split(',').map(s=>s.trim()).filter(Boolean),
            risk_tier: form.risk_tier,
          },
          ifads_mapping: [{ code: form.ifads_code, trigger: form.harm_description, severity: form.risk_tier }],
          evidence_links: [],
        },
      }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-900">New Change Request</h2>
        {result ? (
          <div>
            {(result.accepted || result.valid) ? (
              <div className="text-green-700 font-semibold">✓ Accepted — {result.change_id}</div>
            ) : (
              <div>
                <div className="text-red-600 font-semibold mb-2">Blocked by policy:</div>
                {result.violations?.map(v=><div key={v.rule_id} className="text-sm text-red-500 mb-1">{v.rule_id}: {v.message}</div>)}
              </div>
            )}
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm">Close</button>
          </div>
        ) : (
          <div className="space-y-3">
            {([
              ['Service ID', 'service_id', 'text', 'e.g. SVC-001'],
              ['What are you changing?', 'intent', 'text', 'Describe the change intent'],
              ['Why?', 'reason', 'text', 'Business or research reason'],
              ['Impact?', 'impact', 'text', 'Who / what is affected'],
              ['Population', 'population', 'text', 'Who this service serves'],
              ['Research Lines', 'research_lines', 'text', 'e.g. RL-01, RL-04'],
              ['What could go wrong?', 'harm_description', 'text', 'Harm or drift scenario'],
            ] as [string, string, string, string][]).map(([label, key, type, ph]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">{label}</label>
                <input
                  type={type} placeholder={ph} value={(form as Record<string,string>)[key]}
                  onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ))}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Change Type</label>
                <select value={form.change_type} onChange={e=>setForm(f=>({...f,change_type:e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="create">Create</option>
                  <option value="modify">Modify</option>
                  <option value="retire">Retire</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Risk Tier</label>
                <select value={form.risk_tier} onChange={e=>setForm(f=>({...f,risk_tier:e.target.value as RiskTier}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {(['low','medium','high','critical'] as RiskTier[]).map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={submit} disabled={loading}
                className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                {loading ? 'Submitting…' : 'Submit'}
              </button>
              <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// MAIN DASHBOARD
// ----------------------------------------------------------------
export default function CatalogGovernancePage() {
  const [overview, setOverview] = useState<Overview|null>(null);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ServiceItem|null>(null);
  const [tab, setTab] = useState<'catalog'|'changes'>('catalog');

  useEffect(() => {
    fetch('/api/catalog-governance?action=overview').then(r=>r.json()).then(setOverview);
    fetch('/api/catalog-governance?action=items').then(r=>r.json()).then(d=>setItems(d.items??[]));
    fetch('/api/catalog-governance?action=changes').then(r=>r.json()).then(d=>setChanges(d.changes??[]));
  }, []);

  const STATUS_COLOUR: Record<string,string> = {
    draft:'bg-gray-100 text-gray-600',
    under_review:'bg-blue-100 text-blue-700',
    approved:'bg-green-100 text-green-700',
    rejected:'bg-red-100 text-red-600',
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {showForm && <NewChangeForm onClose={()=>setShowForm(false)} />}

      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Service Catalog Governance</h1>
          <p className="text-xs text-gray-400 mt-0.5">Rows before systems · Intent → Evidence → Classification</p>
        </div>
        <button onClick={()=>setShowForm(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition">
          + New Change Request
        </button>
      </div>

      <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">

        {/* KPI STRIP */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <KPI label="Total Services" value={overview.total} />
            {LIFECYCLE_ORDER.map(l=><KPI key={l} label={l.charAt(0).toUpperCase()+l.slice(1)} value={overview.by_lifecycle[l]??0} />)}
            <KPI label="Missing Evidence" value={overview.missing_evidence} alert />
            <KPI label="Missing IFADS" value={overview.missing_ifads} alert />
            <KPI label="Policy Violations" value={overview.policy_violations} alert />
            <KPI label="Pending Changes" value={overview.pending_changes} />
          </div>
        )}

        {/* TABS */}
        <div className="flex gap-2">
          {(['catalog','changes'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab===t ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {t==='catalog' ? `Catalog (${items.length})` : `Changes (${changes.length})`}
            </button>
          ))}
        </div>

        {/* CATALOG TABLE */}
        {tab==='catalog' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Service','Population','Research Lines','Risk','Lifecycle','Evidence','Violations','Updated'].map(h=>(
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item=>(
                  <tr key={item.id} onClick={()=>setSelectedItem(item===selectedItem?null:item)}
                    className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-400">{item.id} · {item.owner_team}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">{item.population}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.research_lines.map(rl=><Badge key={rl} label={rl} colour="bg-indigo-50 text-indigo-600" />)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={item.risk_tier} colour={RISK_COLOUR[item.risk_tier]} />
                      {item.auto_risk_tier!==item.risk_tier && (
                        <div className="text-xs text-orange-500 mt-0.5">auto: {item.auto_risk_tier}</div>
                      )}
                    </td>
                    <td className="px-4 py-3"><Badge label={item.lifecycle} colour={LIFECYCLE_COLOUR[item.lifecycle]} /></td>
                    <td className="px-4 py-3">
                      {item.backed_by_evidence
                        ? <span className="text-green-600 text-xs font-medium">✓ Verified</span>
                        : <span className="text-red-500 text-xs font-medium">✗ Missing</span>}
                    </td>
                    <td className="px-4 py-3">
                      {item.violations.length > 0
                        ? <span className="text-red-500 text-xs font-semibold">{item.violations.length} violation{item.violations.length>1?'s':''}</span>
                        : <span className="text-green-600 text-xs">✓ Clean</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{item.updated_at.slice(0,10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* INLINE DETAIL PANEL */}
            {selectedItem && (
              <div className="border-t border-gray-200 bg-gray-50 p-6">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-gray-900">{selectedItem.name} — Detail</h3>
                  <button onClick={()=>setSelectedItem(null)} className="text-xs text-gray-400 hover:text-gray-600">✕ close</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Description</p>
                    <p className="text-gray-700">{selectedItem.description}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Research Lines</p>
                    {selectedItem.research_lines.map(rl=><p key={rl} className="text-gray-700 text-xs">{rl}: {RL_LABELS[rl]??rl}</p>)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">IFADS Hooks</p>
                    {selectedItem.ifads_hooks.map((h,i)=>(
                      <div key={i} className="mb-1">
                        <Badge label={h.code} colour="bg-purple-50 text-purple-600" />
                        <span className="text-xs text-gray-500 ml-1">{h.trigger}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Evidence</p>
                    {selectedItem.evidence.length===0
                      ? <p className="text-red-500 text-xs">No evidence refs</p>
                      : selectedItem.evidence.map(e=>(
                          <div key={e.id} className="text-xs text-gray-700">
                            {e.verified ? '✓' : '✗'} {e.id}: {e.label}
                          </div>
                        ))}
                  </div>
                  {selectedItem.violations.length>0 && (
                    <div className="col-span-2">
                      <p className="text-xs font-semibold text-red-500 mb-1">Policy Violations</p>
                      {selectedItem.violations.map(v=>(
                        <div key={v.rule_id} className="text-xs text-red-600">{v.rule_id}: {v.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHANGE QUEUE */}
        {tab==='changes' && (
          <div className="space-y-3">
            {changes.map(c=>(
              <div key={c.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{c.id}</span>
                      <Badge label={c.status} colour={STATUS_COLOUR[c.status]??''} />
                      <Badge label={c.change_type} colour="bg-gray-100 text-gray-600" />
                      <Badge label={c.risk_tier} colour={RISK_COLOUR[c.risk_tier]} />
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{c.intent}</p>
                    <p className="text-xs text-gray-400">Service: {c.service_id} · Submitted: {c.submitted_at.slice(0,10)} by {c.submitted_by}</p>
                  </div>
                </div>
                {(c.old_values||c.new_values) && (
                  <div className="mt-3 flex gap-6 text-xs">
                    {c.old_values && Object.keys(c.old_values).length>0 && (
                      <div>
                        <p className="font-semibold text-gray-400 mb-1">Before</p>
                        {Object.entries(c.old_values).map(([k,v])=>(
                          <div key={k} className="text-red-500">{k}: {String(v)}</div>
                        ))}
                      </div>
                    )}
                    {c.new_values && Object.keys(c.new_values).length>0 && (
                      <div>
                        <p className="font-semibold text-gray-400 mb-1">After</p>
                        {Object.entries(c.new_values).map(([k,v])=>(
                          <div key={k} className="text-green-600">{k}: {String(v)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {changes.length===0 && <p className="text-gray-400 text-sm">No change requests.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
