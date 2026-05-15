// ============================================================
// SERVICE CATALOG GOVERNANCE — CORE LIB
// Tech 4 Humanity Pty Ltd
// Rows before systems. Intent → Execution → Evidence → Classification.
// ============================================================

export type LifecycleState = 'idea' | 'beta' | 'ga' | 'deprecated' | 'retired';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type IFADSCode =
  | 'intent_drift'
  | 'memory_collision'
  | 'ontology_expansion'
  | 'transport_failure'
  | 'reopened_decision'
  | 'signal_distortion'
  | 'population_mismatch'
  | 'consent_gap'
  | 'evidence_absent';

export const RESEARCH_LINES = [
  { id: 'RL-01', label: 'Human digital interaction effects' },
  { id: 'RL-02', label: 'Human difference + AI response' },
  { id: 'RL-03', label: 'AI suitability (Sweet/Black Spots)' },
  { id: 'RL-04', label: 'Signal quality and context' },
  { id: 'RL-05', label: 'Consent, identity, trust' },
  { id: 'RL-06', label: 'Human-machine communication' },
  { id: 'RL-07', label: 'Organisational human adaptation' },
  { id: 'RL-08', label: 'Support and participation environments' },
  { id: 'RL-09', label: 'Biological and future signal pathways' },
] as const;

export type ResearchLineId = typeof RESEARCH_LINES[number]['id'];

export interface EvidenceRef {
  id: string;          // e.g. "TI-01", "IFADS-0004"
  label: string;
  url?: string;
  verified: boolean;
}

export interface IFADSHook {
  code: IFADSCode;
  trigger: string;     // human-readable: "when service mismatches population"
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string;
  owner_team: string;
  owner_email: string;
  escalation_email: string;
  population: string;          // who this serves
  research_lines: ResearchLineId[];
  evidence: EvidenceRef[];
  ifads_hooks: IFADSHook[];
  risk_tier: RiskTier;
  lifecycle: LifecycleState;
  inputs: string[];
  outputs: string[];
  sla: string;
  replacement_service_id?: string;  // required if retired
  sunset_justification?: string;    // required if retired without replacement
  backed_by_evidence: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequest {
  id: string;
  service_id: string;
  intent: string;
  reason: string;
  impact: string;
  change_type: 'create' | 'modify' | 'retire';
  old_values?: Partial<ServiceCatalogItem>;
  new_values: Partial<ServiceCatalogItem>;
  risk_tier: RiskTier;
  evidence_links: string[];
  ifads_mapping: IFADSHook[];
  status: 'draft' | 'under_review' | 'approved' | 'rejected';
  submitted_by: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface PolicyViolation {
  rule_id: string;
  message: string;
  field?: string;
}

// ============================================================
// RISK TIER RESOLVER
// ============================================================
export function resolveRiskTier(item: Partial<ServiceCatalogItem>): RiskTier {
  const population = (item.population ?? '').toLowerCase();
  const lines = item.research_lines ?? [];
  const vulnerableKeywords = ['children', 'ndis', 'bci', 'neural', 'aged', 'disability', 'neurodiver'];
  const isVulnerable = vulnerableKeywords.some(k => population.includes(k));
  if (isVulnerable) return 'critical';
  if (lines.includes('RL-09') || lines.includes('RL-05')) return 'high';
  if (lines.includes('RL-04') || lines.includes('RL-08')) return 'medium';
  return 'low';
}

// ============================================================
// METADATA VALIDATOR
// Returns [] if valid, array of violations otherwise
// ============================================================
export function validateServiceMetadata(item: Partial<ServiceCatalogItem>): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (!item.id) violations.push({ rule_id: 'POL-001', message: 'Service must have an id', field: 'id' });
  if (!item.name) violations.push({ rule_id: 'POL-002', message: 'Service must have a name', field: 'name' });
  if (!item.owner_team) violations.push({ rule_id: 'POL-003', message: 'Service must have an owner_team', field: 'owner_team' });
  if (!item.owner_email) violations.push({ rule_id: 'POL-004', message: 'Service must have an owner_email', field: 'owner_email' });
  if (!item.escalation_email) violations.push({ rule_id: 'POL-005', message: 'Service must have an escalation_email', field: 'escalation_email' });
  if (!item.population) violations.push({ rule_id: 'POL-006', message: 'Service must define population', field: 'population' });
  if (!item.research_lines || item.research_lines.length === 0)
    violations.push({ rule_id: 'POL-007', message: 'Service must reference at least one research line', field: 'research_lines' });
  if (!item.ifads_hooks || item.ifads_hooks.length === 0)
    violations.push({ rule_id: 'POL-008', message: 'Service must define at least one IFADS hook', field: 'ifads_hooks' });

  // GA requires evidence
  if (item.lifecycle === 'ga' && !item.backed_by_evidence)
    violations.push({ rule_id: 'POL-009', message: 'GA lifecycle requires backed_by_evidence=true and at least one verified evidence ref', field: 'lifecycle' });
  if (item.lifecycle === 'ga' && (!item.evidence || item.evidence.filter(e => e.verified).length === 0))
    violations.push({ rule_id: 'POL-010', message: 'GA lifecycle requires at least one verified evidence reference', field: 'evidence' });

  // Retired requires replacement or justification
  if (item.lifecycle === 'retired' && !item.replacement_service_id && !item.sunset_justification)
    violations.push({ rule_id: 'POL-011', message: 'Retired service must have replacement_service_id or sunset_justification', field: 'lifecycle' });

  // Population change to vulnerable without critical tier
  const autoTier = resolveRiskTier(item);
  if (autoTier === 'critical' && item.risk_tier !== 'critical')
    violations.push({ rule_id: 'POL-012', message: `Population "${item.population}" requires risk_tier=critical`, field: 'risk_tier' });

  return violations;
}

// ============================================================
// RETIREMENT SAFETY CHECK
// ============================================================
export function retirementSafetyCheck(item: ServiceCatalogItem): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  if (!item.replacement_service_id && !item.sunset_justification)
    violations.push({ rule_id: 'POL-011', message: 'Cannot retire without replacement_service_id or sunset_justification' });
  if (item.risk_tier === 'critical' && !item.replacement_service_id)
    violations.push({ rule_id: 'POL-013', message: 'Critical-tier service retirement requires an explicit replacement_service_id' });
  return violations;
}

// ============================================================
// IFADS EVENT EMITTER SHAPE
// Wire to your Supabase ifads_events table or ops.work_queue
// ============================================================
export interface IFADSEvent {
  event_type: 'catalog_change' | 'catalog_policy_violation' | 'catalog_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  service_id: string;
  change_id?: string;
  intent_summary: string;
  ifads_code: IFADSCode;
  payload: Record<string, unknown>;
  created_at: string;
}

export function buildIFADSEvent(
  type: IFADSEvent['event_type'],
  severity: IFADSEvent['severity'],
  service_id: string,
  ifads_code: IFADSCode,
  intent_summary: string,
  payload: Record<string, unknown>,
  change_id?: string
): IFADSEvent {
  return {
    event_type: type,
    severity,
    service_id,
    change_id,
    intent_summary,
    ifads_code,
    payload,
    created_at: new Date().toISOString(),
  };
}
