# OrderDesk - Bobblehead Order Management

## Original Problem Statement
A full-stack order management system for Bobbleheads vendors, integrating with Shopify. Orders flow through configurable workflow stages (Clay → Paint → Shipped) with proofs, customer approvals, email reminders, and timeline tracking.

## Core Stack
- **Backend**: FastAPI + MongoDB (motor async). Single-tenant.
- **Frontend**: React CRA + Shadcn UI + Tailwind.
- **Integrations**: Shopify (order ingestion + tag sync), Google Sheets (optional backup).

## Key Architecture
- Workflow is defined by `tenant.settings.workflow_config` (stages + statuses + rules).
- Dynamic stage/status dropdowns throughout the UI via `BrandingContext`.
- `workflow_rules_engine.py` validates stage transitions.
- Order splitting: a Shopify order is split into sub-orders ONLY when it contains
  multiple distinct SKUs. Identical items (same SKU × N) are kept as a single
  order with `total_quantity = N` since they share one proof workflow.

## Key Endpoints
- `POST /api/admin/login` → `{token}`
- `GET  /api/admin/orders` (paginated list, excludes heavy fields, returns `total_quantity`)
- `GET  /api/orders/{id}` (full detail, includes line_items/timeline/proofs)
- `PATCH /api/admin/orders/{id}/status` (stage/status change + email notify)
- `POST /api/admin/orders/bulk-update` (IDs → stage + status)
- `POST /api/admin/orders/bulk-archive` (IDs)
- `POST /api/admin/orders/bulk-delete` (IDs, cascades sub-orders) ✨ NEW
- `POST /api/admin/orders/bulk-delete-by-filter` (filter-based, `expected_count` safety) ✨ NEW
- `DELETE /api/admin/orders/{id}` (single order, cascades) ✨ NEW

## What's been implemented
### 2026-04-21 — Bulk Delete + Smart Splitting
- **Bulk delete** from OrderDesk: red Delete button in multi-select toolbar,
  confirmation AlertDialog, cascades to sub-orders.
- **"Select all N matching this filter"** Gmail-style banner when full page is
  selected; delete applies server-side by filter via `bulk-delete-by-filter`
  with an `expected_count` guard (409 on mismatch).
- **Single-order delete** button in OrderDetailsAdmin header, confirmation dialog.
- **Splitting logic rewritten** in `utils/order_splitting.py`:
  identical items do not split; multiple distinct SKUs create one sub-order
  per unique SKU with quantity preserved.
- **`total_quantity`** field added to order documents (set on create/sync;
  backfilled at startup — 283 existing orders updated).
- **"Qty N" badge** shown on OrderDesk rows and OrderDetailsAdmin header when
  `total_quantity > 1`.
- Pytest suite at `/app/backend/tests/test_bulk_delete_and_splitting.py`
  (17 cases, 100% pass).

### Earlier (previous sessions)
- Unified workflow config (backend parses `workflow_config`, merges legacy).
- Email notifications on manual stage/status change.
- Custom `shipped_status` support (e.g., "Ready to ship").
- Dynamic dropdowns in OrderDetailsAdmin (removed hardcoded "Pending" etc.).
- Settings → "Initialize Workflow Configuration" button.

## Backlog / Roadmap

### P1
- **Google Sheets Sync** stopped on live site — investigate credentials & logic.
- Enhance data-export feature.

### P2
- Dry-run mode for email scheduler.
- Ship24 real-time tracking API.
- Bulk operations: bulk archive/change-stage already exist; add bulk "send reminder"
  by filter (similar pattern to bulk-delete-by-filter).

### Refactoring backlog
- `server.py` is 4,000+ lines — migrate remaining routes into `/app/backend/routes/`.
- `OrderDesk.js`, `OrderDetailsAdmin.js`, `Settings.js` each 1k+ lines — split into subcomponents.
- Dead code to remove: `server_new.py`, `server_old_backup.py`, `utils/workflow.py`,
  `components/WorkflowConfig.js` (confirmed unused).
- Stale `/app/*.py` test files & `/app/*.md` docs from earlier sessions.
- Proofs stored as base64 in MongoDB docs — move to object storage.
- Shopify sync button should be replaced with webhooks.
- No frontend query cache (React Query / SWR) — every nav refetches.
- `routes/orders.py` `get_db()` creates a new MongoClient per request (leak).

### Future
- Workflow Import/Export.
- User-configurable timezone.
- Workflow analytics (avg days per stage, bottleneck detection, WIP limits).
- Audit log UI (model exists, no view).
- Saved filter presets on OrderDesk.
- Keyboard shortcuts for admin power users.

## Credentials
- **Admin**: username `admin`, password `admin123`
