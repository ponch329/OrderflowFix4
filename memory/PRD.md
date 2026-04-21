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
### 2026-04-21 — Object Storage, React Query infra, Perf & Cleanup
- **Object storage for proofs** (Emergent object storage):
  - New `/app/backend/utils/object_storage.py` helper.
  - `save_file_reference()` uploads bytes + records metadata in `files` collection.
  - `GET /api/files/{file_id}` serves files (public, cacheable; UUID acts as secret).
  - Proof upload flow rewritten — no more base64 in order docs.
  - Startup migration: **36 existing proofs moved to object storage**.
  - Orders collection **shrunk from 10.76 MB → 0.49 MB (95% reduction)**; max doc from ~4 MB → 30 KB.
  - Zero frontend changes needed — relative `/api/files/{id}` URLs proxied via ingress.
- **React Query installed** (`@tanstack/react-query@5.99.2`):
  - `QueryClientProvider` wraps `App.js`; shared client in `/app/frontend/src/lib/queryClient.js`.
  - Ready-to-use hooks in `/app/frontend/src/lib/useOrders.js`: `useOrders`, `useOrderCounts`, `useOrder`, `useBulkDeleteOrders`, `useBulkUpdateOrders`, `useDeleteOrder`. Per-page conversion deferred to future session.
- **MongoClient connection leak fixed** in all 6 `routes/*.py` files — now reuse a module-scoped `AsyncIOMotorClient`.
- **Workflow config cached** (30s TTL + explicit invalidation at all 3 write sites).
- **EXIF orientation** — replaced 30-line block with `ImageOps.exif_transpose`.
- **Dead code removed**: `server_new.py`, `server_old_backup.py`, `utils/workflow.py`, `components/WorkflowConfig.js` (~2,600 lines).

### 2026-04-21 — Bulk Delete + Smart Splitting (earlier)
- Bulk delete + cascade (IDs and filter-based), single-order delete.
- "Select all N matching filter" Gmail-style banner.
- Splitting rewritten: identical SKUs don't split; mixed SKUs split by SKU group.
- `total_quantity` field on orders + "Qty N" badge in UI.

### Earlier (previous sessions)
- Unified workflow config (backend parses `workflow_config`, merges legacy).
- Email notifications on manual stage/status change.
- Custom `shipped_status` support.
- Dynamic dropdowns (removed hardcoded "Pending" etc.).

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
