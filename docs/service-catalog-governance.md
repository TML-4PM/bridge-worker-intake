# Service Catalog Governance

Tech 4 Humanity Pty Ltd — T4H Platform

> **Operating principle:** Rows before systems. Intent → Execution → Evidence → Classification.

---

## What this governs

Every exposed service in the T4H portfolio must be registered, evidence-backed, research-linked, and IFADS-hooked before it can be promoted to GA. This catalog is a **view over research + IFADS**, not a product marketing list.

---

## Service lifecycle

| State | Meaning | Promotion requirement |
|---|---|---|
| `idea` | Concept only | None |
| `beta` | Live but not evidence-validated | Research line(s) declared |
| `ga` | Production, fully governed | `backed_by_evidence=true` + verified evidence ref(s) |
| `deprecated` | Superseded, still running | Replacement service declared |
| `retired` | Off | `replacement_service_id` OR `sunset_justification` |

---

## Risk tiers

| Tier | Population examples | Extra requirements |
|---|---|---|
| `low` | General public | None |
| `medium` | Workplace, HR, families | Escalation contact required |
| `high` | RL-04 (signal), RL-05 (consent) | IFADS hooks mandatory |
| `critical` | Children, NDIS, BCI, neurodivergent | Critical IFADS hooks + consent model + verified evidence |

Risk tier is **auto-resolved** from population keywords. If auto-tier > declared tier, the API blocks the change.

---

## Policy rules

| Rule | Description |
|---|---|
| POL-001 to POL-006 | Mandatory fields (id, name, owner, escalation, population) |
| POL-007 | At least one research line |
| POL-008 | At least one IFADS hook |
| POL-009 | GA requires `backed_by_evidence=true` |
| POL-010 | GA requires at least one verified evidence reference |
| POL-011 | Retired requires replacement or justification |
| POL-012 | Population auto-tier must match declared risk tier |
| POL-013 | Critical-tier retirement requires replacement service |

---

## IFADS hook codes

| Code | When to use |
|---|---|
| `intent_drift` | Service scope expands beyond original research intent |
| `memory_collision` | Old assumptions re-enter without evidence |
| `ontology_expansion` | New category created instead of new row |
| `transport_failure` | Output generated but not delivered/committed |
| `reopened_decision` | Confirmed decision re-litigated |
| `signal_distortion` | Signal interpreted under duress or observation effect |
| `population_mismatch` | Service used outside declared population |
| `consent_gap` | Personal signal used without active consent |
| `evidence_absent` | GA claim made without verified evidence |

---

## API routes

### GET `/api/catalog-governance`

| `action` | Returns |
|---|---|
| `overview` | KPI summary: counts by lifecycle, missing owner/evidence/IFADS, violations, pending changes |
| `items` | All services enriched with policy violations and auto risk tier |
| `items&service_id=SVC-001` | Single service |
| `changes` | All change requests |
| `retire_check&service_id=SVC-001` | Safety check before retirement |

### POST `/api/catalog-governance`

```json
// Validate metadata only
{ "action": "validate", "item": { ...ServiceCatalogItem } }

// Submit change request
{
  "action": "change_request",
  "change_request": {
    "service_id": "SVC-001",
    "intent": "Promote to GA",
    "reason": "Pilot evidence validated",
    "impact": "Wider rollout",
    "change_type": "modify",
    "risk_tier": "medium",
    "new_values": { "lifecycle": "ga" },
    "ifads_mapping": [{ "code": "intent_drift", "trigger": "Scope exceeds pilot population", "severity": "medium" }],
    "evidence_links": ["TI-01"]
  }
}
```

---

## Wiring to Supabase

All seed arrays (`ITEMS`, `CHANGES`) in `route.ts` are placeholders. Replace with:

```ts
const { data: items } = await supabase.from('service_catalog').select('*');
const { data: changes } = await supabase.from('service_changes').select('*');
```

Every accepted POST should:
1. `insert` into `service_changes`
2. `insert` into `ifads_events` using `buildIFADSEvent()`
3. Return `{ accepted: true, change_id, ifads_event }`

Every blocked POST should:
1. `insert` into `catalog_policy_violations`
2. Return `{ accepted: false, violations }` with HTTP 422

---

## What this blocks outright (day 1)

- GA without verified research evidence
- Any service touching children, NDIS, or BCI without `risk_tier: critical`
- Population change to vulnerable group without tier escalation
- Retirement of critical-tier service without replacement
- New ontology category instead of selecting existing research line (form forces description + logs `ontology_expansion_candidate`)
