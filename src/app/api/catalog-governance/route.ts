import { NextRequest, NextResponse } from 'next/server';
import {
  CatalogItem, ChangeRequest,
  resolveApprovalTier, resolveRequiredApprovers,
  retirementSafetyCheck, validateMetadata, isStale,
} from '@/lib/catalog-governance';

const ITEMS: CatalogItem[] = [
  {
    id: 'svc-001', service_name: 'WorkFamilyAI Intake',
    service_owner: 'troy@tech4humanity.com.au', fulfillment_owner: 'platform-team',
    domain: 'AI Suitability', category: 'Intake',
    description: 'Intake workflow for WorkFamilyAI requests.',
    consumer: 'Organisation leads', sla: '2 business days',
    lifecycle_state: 'active', review_date: '2026-06-01',
    replacement_item: null, dependency_refs: [],
    created_at: '2026-01-10T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'svc-002', service_name: 'Outcome Ready Assessment',
    service_owner: 'troy@tech4humanity.com.au', fulfillment_owner: 'ndis-team',
    domain: 'Support & Participation', category: 'Assessment',
    description: 'NDIS outcome-readiness assessment service.',
    consumer: 'Support coordinators', sla: '5 business days',
    lifecycle_state: 'active', review_date: '2026-04-01',
    replacement_item: null, dependency_refs: ['svc-001'],
    created_at: '2025-11-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'svc-003', service_name: 'Legacy Signal Classifier v1',
    service_owner: 'troy@tech4humanity.com.au', fulfillment_owner: 'signal-team',
    domain: 'Signal Quality', category: 'Classification',
    description: 'Original signal classification — superseded by v2.',
    consumer: 'Internal', sla: 'N/A',
    lifecycle_state: 'deprecated', review_date: '2025-12-01',
    replacement_item: 'svc-004', dependency_refs: [],
    created_at: '2024-06-01T00:00:00Z', updated_at: '2025-11-01T00:00:00Z',
  },
  {
    id: 'svc-004', service_name: 'Signal Classifier v2',
    service_owner: 'troy@tech4humanity.com.au', fulfillment_owner: 'signal-team',
    domain: 'Signal Quality', category: 'Classification',
    description: 'Context-aware signal classification with duress detection.',
    consumer: 'MyNeuralSignal pipeline', sla: '< 500ms',
    lifecycle_state: 'active', review_date: '2026-08-01',
    replacement_item: null, dependency_refs: [],
    created_at: '2025-08-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
  },
];

const CHANGES: ChangeRequest[] = [
  {
    id: 'cr-001', item_id: 'svc-001', item_name: 'WorkFamilyAI Intake',
    change_class: 'standard', approval_tier: 'tier_2', status: 'pending',
    requested_by: 'troy@tech4humanity.com.au', requested_at: '2026-05-15T08:00:00Z',
    summary: 'Extend SLA from 2 to 3 business days and update eligibility criteria.',
    fields_changed: ['sla', 'consumer'],
    approvers: [
      { name: 'Service Owner', role: 'owner',  status: 'approved' },
      { name: 'Domain Lead',   role: 'domain', status: 'pending'  },
    ],
  },
  {
    id: 'cr-002', item_id: 'svc-003', item_name: 'Legacy Signal Classifier v1',
    change_class: 'high_risk', approval_tier: 'tier_3', status: 'pending',
    requested_by: 'troy@tech4humanity.com.au', requested_at: '2026-05-16T01:00:00Z',
    summary: 'Retire legacy classifier — all consumers migrated to v2.',
    fields_changed: ['lifecycle_state'],
    approvers: [
      { name: 'Service Owner',    role: 'owner',      status: 'approved' },
      { name: 'Governance Board', role: 'governance', status: 'pending'  },
      { name: 'Risk & Assurance', role: 'assurance',  status: 'pending'  },
    ],
    retirement_reason: 'Superseded by Signal Classifier v2. All consumers migrated.',
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') ?? 'overview';
  const now = new Date().toISOString();

  if (action === 'overview') {
    const stale   = ITEMS.filter(i => isStale(i, now) && i.lifecycle_state === 'active');
    const noOwner = ITEMS.filter(i => !i.service_owner || !i.fulfillment_owner);
    const pending = CHANGES.filter(c => c.status === 'pending');
    return NextResponse.json({
      total_items:     ITEMS.length,
      active:          ITEMS.filter(i => i.lifecycle_state === 'active').length,
      deprecated:      ITEMS.filter(i => i.lifecycle_state === 'deprecated').length,
      retired:         ITEMS.filter(i => i.lifecycle_state === 'retired').length,
      stale_items:     stale.length,
      orphaned_items:  noOwner.length,
      pending_changes: pending.length,
      pending_tier_1:  pending.filter(c => c.approval_tier === 'tier_1').length,
      pending_tier_2:  pending.filter(c => c.approval_tier === 'tier_2').length,
      pending_tier_3:  pending.filter(c => c.approval_tier === 'tier_3').length,
    });
  }
  if (action === 'items')   return NextResponse.json({ items: ITEMS });
  if (action === 'changes') return NextResponse.json({ changes: CHANGES });
  if (action === 'retire_check') {
    const item = ITEMS.find(i => i.id === searchParams.get('item_id'));
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    return NextResponse.json({ item_id: item.id, ...retirementSafetyCheck(item, 0, []) });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === 'validate') {
    const missing = validateMetadata(body.item ?? {});
    return NextResponse.json({ valid: missing.length === 0, missing_fields: missing });
  }
  if (body.action === 'create_change') {
    const tier      = resolveApprovalTier(body.change_class);
    const approvers = resolveRequiredApprovers(tier);
    const cr: ChangeRequest = {
      id:               `cr-${Date.now()}`,
      item_id:          body.item_id,
      item_name:        body.item_name ?? '',
      change_class:     body.change_class,
      approval_tier:    tier,
      status:           'pending',
      requested_by:     body.requested_by,
      requested_at:     new Date().toISOString(),
      summary:          body.summary,
      fields_changed:   body.fields_changed ?? [],
      approvers,
      retirement_reason: body.retirement_reason,
    };
    return NextResponse.json({ change_request: cr }, { status: 201 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
