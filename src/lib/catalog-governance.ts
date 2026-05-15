// ─── Service Catalog Change Governance — Core Types & Logic ────────────────

export type LifecycleState = 'draft' | 'active' | 'deprecated' | 'retired' | 'removed';
export type ChangeClass   = 'metadata' | 'standard' | 'high_risk';
export type ApprovalTier  = 'tier_1' | 'tier_2' | 'tier_3';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface CatalogItem {
  id:               string;
  service_name:     string;
  service_owner:    string;
  fulfillment_owner: string;
  domain:           string;
  category:         string;
  description:      string;
  consumer:         string;
  sla:              string;
  lifecycle_state:  LifecycleState;
  review_date:      string;
  replacement_item: string | null;
  dependency_refs:  string[];
  created_at:       string;
  updated_at:       string;
}

export interface ChangeRequest {
  id:               string;
  item_id:          string;
  item_name:        string;
  change_class:     ChangeClass;
  approval_tier:    ApprovalTier;
  status:           ApprovalStatus;
  requested_by:     string;
  requested_at:     string;
  summary:          string;
  fields_changed:   string[];
  approvers:        Approver[];
  retirement_reason?: string;
}

export interface Approver {
  name:   string;
  role:   string;
  status: 'pending' | 'approved' | 'rejected';
}

export function resolveApprovalTier(changeClass: ChangeClass): ApprovalTier {
  switch (changeClass) {
    case 'metadata':  return 'tier_1';
    case 'standard':  return 'tier_2';
    case 'high_risk': return 'tier_3';
  }
}

export function resolveRequiredApprovers(tier: ApprovalTier): Approver[] {
  const base:   Approver = { name: 'Service Owner',      role: 'owner',      status: 'pending' };
  const domain: Approver = { name: 'Domain Lead',        role: 'domain',     status: 'pending' };
  const gov:    Approver = { name: 'Governance Board',   role: 'governance', status: 'pending' };
  const risk:   Approver = { name: 'Risk & Assurance',   role: 'assurance',  status: 'pending' };
  switch (tier) {
    case 'tier_1': return [base];
    case 'tier_2': return [base, domain];
    case 'tier_3': return [base, gov, risk];
  }
}

export interface RetirementCheckResult {
  safe:     boolean;
  blockers: string[];
  warnings: string[];
}

export function retirementSafetyCheck(
  item: CatalogItem,
  openRequests: number,
  activeDependents: string[]
): RetirementCheckResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (item.lifecycle_state === 'active')
    blockers.push('Item is still Active — must be Deprecated before retiring.');
  if (openRequests > 0)
    blockers.push(`${openRequests} open request(s) must be resolved before retirement.`);
  if (activeDependents.length > 0)
    blockers.push(`Dependent items still linked: ${activeDependents.join(', ')}.`);
  if (!item.replacement_item)
    warnings.push('No replacement item linked — consumers may have no redirect path.');
  return { safe: blockers.length === 0, blockers, warnings };
}

export function isStale(item: CatalogItem, nowIso: string): boolean {
  if (!item.review_date) return true;
  return new Date(item.review_date) < new Date(nowIso);
}

export function validateMetadata(item: Partial<CatalogItem>): string[] {
  const required: (keyof CatalogItem)[] = [
    'service_name', 'service_owner', 'fulfillment_owner',
    'domain', 'category', 'description', 'consumer', 'sla',
    'lifecycle_state', 'review_date',
  ];
  return required.filter(f => !item[f]);
}
