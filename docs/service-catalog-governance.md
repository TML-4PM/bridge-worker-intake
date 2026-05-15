# Service Catalog Change Governance

Governance module for ownership, approvals, lifecycle, and safe retirement of catalog items.

## Files

| File | Purpose |
|---|---|
| `src/lib/catalog-governance.ts` | Types, tier resolver, retirement safety check, metadata validator |
| `src/app/api/catalog-governance/route.ts` | API — overview, items, changes, retire check, create change, validate |
| `src/app/catalog-governance/page.tsx` | Dashboard — health KPIs, catalog table, change queue, new request form |

## Routes

- `GET /api/catalog-governance?action=overview`
- `GET /api/catalog-governance?action=items`
- `GET /api/catalog-governance?action=changes`
- `GET /api/catalog-governance?action=retire_check&item_id=svc-001`
- `POST /api/catalog-governance` `{ action: 'validate', item: {...} }`
- `POST /api/catalog-governance` `{ action: 'create_change', ... }`
- `/catalog-governance` — dashboard page

## Approval tiers

| Tier | Class | Approvers |
|---|---|---|
| Tier 1 | metadata | Service owner |
| Tier 2 | standard | Service owner + domain lead |
| Tier 3 | high_risk | Service owner + governance board + risk & assurance |

## Lifecycle flow

`draft` → `active` → `deprecated` → `retired` → `removed`

Never jump active → retired. Never delete an item with active consumers.

## To go live

Replace the `ITEMS` / `CHANGES` seed arrays in `route.ts` with Supabase queries.

## Operating rule

Rows before systems. A catalog problem creates a change request row, not a new platform.
