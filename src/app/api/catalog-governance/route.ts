// ============================================================
// SERVICE CATALOG GOVERNANCE — API ROUTE (Supabase-wired)
// GET  /api/catalog-governance?action=overview|items|changes|retire_check
// POST /api/catalog-governance  { action: 'validate'|'change_request' }
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  ServiceCatalogItem,
  ChangeRequest,
  validateServiceMetadata,
  retirementSafetyCheck,
  buildIFADSEvent,
  resolveRiskTier,
} from '@/lib/catalog-governance';

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key);
}

// ----------------------------------------------------------------
// GET handler
// ----------------------------------------------------------------
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'overview';
  const service_id = req.nextUrl.searchParams.get('service_id');
  const supabase = db();

  if (action === 'overview') {
    const { data: items, error } = await supabase.from('service_catalog').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: changes } = await supabase.from('service_changes').select('id,status');
    const byLifecycle = (items ?? []).reduce((acc: Record<string,number>, i: ServiceCatalogItem) => {
      acc[i.lifecycle] = (acc[i.lifecycle] ?? 0) + 1; return acc;
    }, {});
    const policyViolations = (items ?? []).flatMap((i: ServiceCatalogItem) => validateServiceMetadata(i)).length;
    return NextResponse.json({
      total: items?.length ?? 0,
      by_lifecycle: byLifecycle,
      missing_owner: (items ?? []).filter((i: ServiceCatalogItem) => !i.owner_email).length,
      missing_evidence: (items ?? []).filter((i: ServiceCatalogItem) => !i.backed_by_evidence).length,
      missing_ifads: (items ?? []).filter((i: ServiceCatalogItem) => !i.ifads_hooks?.length).length,
      policy_violations: policyViolations,
      pending_changes: (changes ?? []).filter((c: {status:string}) => ['draft','under_review'].includes(c.status)).length,
    });
  }

  if (action === 'items') {
    let q = supabase.from('service_catalog').select('*');
    if (service_id) q = q.eq('id', service_id);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const enriched = (data ?? []).map((item: ServiceCatalogItem) => ({
      ...item,
      violations: validateServiceMetadata(item),
      auto_risk_tier: resolveRiskTier(item),
    }));
    return NextResponse.json({ items: enriched });
  }

  if (action === 'changes') {
    let q = supabase.from('service_changes').select('*').order('submitted_at', { ascending: false });
    if (service_id) q = q.eq('service_id', service_id);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changes: data ?? [] });
  }

  if (action === 'retire_check') {
    if (!service_id) return NextResponse.json({ error: 'service_id required' }, { status: 400 });
    const { data, error } = await supabase.from('service_catalog').select('*').eq('id', service_id).single();
    if (error || !data) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    const violations = retirementSafetyCheck(data as ServiceCatalogItem);
    return NextResponse.json({ safe: violations.length === 0, violations });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// ----------------------------------------------------------------
// POST handler
// ----------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  const supabase = db();

  if (action === 'validate') {
    const violations = validateServiceMetadata(body.item ?? {});
    return violations.length > 0
      ? NextResponse.json({ valid: false, violations }, { status: 422 })
      : NextResponse.json({ valid: true });
  }

  if (action === 'change_request') {
    const cr: Partial<ChangeRequest> = body.change_request;
    if (!cr.service_id || !cr.intent || !cr.reason || !cr.new_values)
      return NextResponse.json({ error: 'change_request requires service_id, intent, reason, new_values' }, { status: 400 });

    // Policy check on proposed new values
    const violations = validateServiceMetadata(cr.new_values as Partial<ServiceCatalogItem>);
    if (violations.length > 0) {
      // Log violation
      await supabase.from('catalog_policy_violations').insert({
        service_id: cr.service_id,
        change_payload: cr as unknown as Record<string,unknown>,
        violations,
      });
      return NextResponse.json({ accepted: false, violations }, { status: 422 });
    }

    const change_id = `CHG-${Date.now()}`;

    // Insert change request
    const { error: crErr } = await supabase.from('service_changes').insert({
      id: change_id,
      service_id: cr.service_id,
      intent: cr.intent,
      reason: cr.reason ?? '',
      impact: cr.impact ?? '',
      change_type: cr.change_type ?? 'modify',
      old_values: cr.old_values ?? null,
      new_values: cr.new_values,
      risk_tier: cr.risk_tier ?? resolveRiskTier(cr.new_values as Partial<ServiceCatalogItem>),
      evidence_links: cr.evidence_links ?? [],
      ifads_mapping: cr.ifads_mapping ?? [],
      status: 'draft',
      submitted_by: cr.submitted_by ?? 'api',
    });
    if (crErr) return NextResponse.json({ error: crErr.message }, { status: 500 });

    // Emit IFADS event
    const event = buildIFADSEvent(
      'catalog_change',
      (cr.risk_tier ?? 'low') as 'low'|'medium'|'high'|'critical',
      cr.service_id,
      'intent_drift',
      cr.intent,
      { change_request: cr },
      change_id
    );
    await supabase.from('ifads_events').insert({
      event_type: event.event_type,
      severity: event.severity,
      service_id: event.service_id,
      change_id: event.change_id,
      intent_summary: event.intent_summary,
      ifads_code: event.ifads_code,
      payload: event.payload,
    });

    return NextResponse.json({ accepted: true, change_id, ifads_event: event });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
