// ============================================================
// SERVICE CATALOG GOVERNANCE — API ROUTE
// GET  /api/catalog-governance?action=overview|items|changes|retire_check
// POST /api/catalog-governance  { action: 'validate'|'change_request' }
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import {
  ServiceCatalogItem,
  ChangeRequest,
  validateServiceMetadata,
  retirementSafetyCheck,
  buildIFADSEvent,
  resolveRiskTier,
} from '@/lib/catalog-governance';

// ----------------------------------------------------------------
// SEED DATA — swap these for Supabase queries
// ----------------------------------------------------------------
const ITEMS: ServiceCatalogItem[] = [
  {
    id: 'SVC-001',
    name: 'WorkFamilyAI',
    description: 'Adaptive AI support for workplace and family participation contexts',
    owner_team: 'T4H Product',
    owner_email: 'troy.latter@4pm.net.au',
    escalation_email: 'troy.latter@4pm.net.au',
    population: 'working families and HR practitioners',
    research_lines: ['RL-01', 'RL-07'],
    evidence: [{ id: 'TI-01', label: 'Workplace AI Suitability Study', verified: true }],
    ifads_hooks: [{ code: 'population_mismatch', trigger: 'Service used outside working family context', severity: 'high' }],
    risk_tier: 'medium',
    lifecycle: 'beta',
    inputs: ['user role', 'family context', 'org structure'],
    outputs: ['adaptive support', 'participation score'],
    sla: '99.5% uptime',
    backed_by_evidence: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2025-05-01T00:00:00Z',
  },
  {
    id: 'SVC-002',
    name: 'Outcome Ready',
    description: 'NDIS outcome tracking and participant support tool',
    owner_team: 'T4H NDIS',
    owner_email: 'troy.latter@4pm.net.au',
    escalation_email: 'troy.latter@4pm.net.au',
    population: 'NDIS participants and support coordinators',
    research_lines: ['RL-08', 'RL-05'],
    evidence: [{ id: 'TI-03', label: 'NDIS Outcome Measurement Pilot', verified: true }],
    ifads_hooks: [
      { code: 'consent_gap', trigger: 'Participant data accessed without consent verification', severity: 'critical' },
      { code: 'population_mismatch', trigger: 'Used outside NDIS participant context', severity: 'high' },
    ],
    risk_tier: 'critical',
    lifecycle: 'beta',
    inputs: ['participant goals', 'support hours', 'provider data'],
    outputs: ['outcome score', 'progress report'],
    sla: '99.9% uptime',
    backed_by_evidence: true,
    created_at: '2024-06-01T00:00:00Z',
    updated_at: '2025-05-01T00:00:00Z',
  },
  {
    id: 'SVC-003',
    name: 'MyNeuralSignal',
    description: 'Signal trust and BCI-adjacent research platform',
    owner_team: 'T4H Research',
    owner_email: 'troy.latter@4pm.net.au',
    escalation_email: 'troy.latter@4pm.net.au',
    population: 'research participants — neurodiverse and BCI adjacent',
    research_lines: ['RL-04', 'RL-09', 'RL-05'],
    evidence: [],
    ifads_hooks: [
      { code: 'signal_distortion', trigger: 'Signal interpreted under duress conditions', severity: 'critical' },
      { code: 'consent_gap', trigger: 'Signal collected without active consent', severity: 'critical' },
    ],
    risk_tier: 'critical',
    lifecycle: 'idea',
    inputs: ['biosignal stream', 'consent token', 'context tag'],
    outputs: ['signal quality score', 'adaptive response'],
    sla: 'research use only',
    backed_by_evidence: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-05-01T00:00:00Z',
  },
];

const CHANGES: ChangeRequest[] = [
  {
    id: 'CHG-001',
    service_id: 'SVC-001',
    intent: 'Promote WorkFamilyAI from Beta to GA',
    reason: 'Pilot complete, evidence validated',
    impact: 'Wider org rollout',
    change_type: 'modify',
    old_values: { lifecycle: 'beta' },
    new_values: { lifecycle: 'ga' },
    risk_tier: 'medium',
    evidence_links: ['TI-01'],
    ifads_mapping: [{ code: 'intent_drift', trigger: 'GA rollout exceeds target population', severity: 'medium' }],
    status: 'under_review',
    submitted_by: 'troy.latter@4pm.net.au',
    submitted_at: '2026-05-14T10:00:00Z',
  },
];

// ----------------------------------------------------------------
// GET handler
// ----------------------------------------------------------------
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'overview';
  const service_id = req.nextUrl.searchParams.get('service_id');

  switch (action) {
    case 'overview': {
      const byLifecycle = ITEMS.reduce((acc, i) => {
        acc[i.lifecycle] = (acc[i.lifecycle] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const missingOwner = ITEMS.filter(i => !i.owner_email).length;
      const missingEvidence = ITEMS.filter(i => !i.backed_by_evidence).length;
      const missingIFADS = ITEMS.filter(i => i.ifads_hooks.length === 0).length;
      const policyViolations = ITEMS.flatMap(i => validateServiceMetadata(i)).length;
      return NextResponse.json({
        total: ITEMS.length,
        by_lifecycle: byLifecycle,
        missing_owner: missingOwner,
        missing_evidence: missingEvidence,
        missing_ifads: missingIFADS,
        policy_violations: policyViolations,
        pending_changes: CHANGES.filter(c => c.status === 'under_review' || c.status === 'draft').length,
      });
    }

    case 'items': {
      const items = service_id ? ITEMS.filter(i => i.id === service_id) : ITEMS;
      const enriched = items.map(item => ({
        ...item,
        violations: validateServiceMetadata(item),
        auto_risk_tier: resolveRiskTier(item),
      }));
      return NextResponse.json({ items: enriched });
    }

    case 'changes': {
      const changes = service_id ? CHANGES.filter(c => c.service_id === service_id) : CHANGES;
      return NextResponse.json({ changes });
    }

    case 'retire_check': {
      if (!service_id) return NextResponse.json({ error: 'service_id required' }, { status: 400 });
      const item = ITEMS.find(i => i.id === service_id);
      if (!item) return NextResponse.json({ error: 'Service not found' }, { status: 404 });
      const violations = retirementSafetyCheck(item);
      return NextResponse.json({ safe: violations.length === 0, violations });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}

// ----------------------------------------------------------------
// POST handler
// ----------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === 'validate') {
    const violations = validateServiceMetadata(body.item ?? {});
    if (violations.length > 0) {
      return NextResponse.json({ valid: false, violations }, { status: 422 });
    }
    return NextResponse.json({ valid: true });
  }

  if (action === 'change_request') {
    const cr: Partial<ChangeRequest> = body.change_request;
    if (!cr.service_id || !cr.intent || !cr.reason || !cr.new_values)
      return NextResponse.json({ error: 'change_request requires service_id, intent, reason, new_values' }, { status: 400 });

    // Validate new_values against policy
    const violations = validateServiceMetadata(cr.new_values as Partial<ServiceCatalogItem>);
    if (violations.length > 0)
      return NextResponse.json({ accepted: false, violations }, { status: 422 });

    // Build IFADS event row (in production: insert to Supabase)
    const event = buildIFADSEvent(
      'catalog_change',
      cr.risk_tier ?? 'low',
      cr.service_id,
      'intent_drift',
      cr.intent ?? '',
      { change_request: cr },
      `CHG-${Date.now()}`
    );

    // In production: insert cr into service_changes table, insert event into ifads_events
    return NextResponse.json({ accepted: true, change_id: event.change_id, ifads_event: event });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
