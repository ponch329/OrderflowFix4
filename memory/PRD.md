# OrderDesk - Bobblehead Proof Approval System

## Original Problem Statement
A multi-tenant SaaS application for managing bobblehead order workflows with proof approval processes, integrating with Shopify for order syncing and tracking.

## Core Features Implemented
- **Order Management Dashboard**: View, filter, and manage orders across stages (Clay, Paint, Shipped, Archived)
- **Shopify Integration**: Sync orders from Shopify, import tracking numbers, sync order tags back to Shopify
- **Proof Upload & Approval**: Upload clay and paint proofs with image compression, customer approval workflow
- **Workflow Rules**: Configurable rules for automatic stage transitions based on triggers (time delay, tracking added)
- **Email Notifications**: Automated emails for workflow events
- **Customer Portal**: Customers can view and approve proofs

## Architecture
- **Frontend**: React with shadcn/ui components
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **External Integrations**: Shopify API, Google Sheets (logging)

## Key Files
- `/app/backend/server.py` - Main backend API
- `/app/backend/utils/order_splitting.py` - Order splitting by quantity
- `/app/frontend/src/pages/OrderDesk.js` - Main dashboard
- `/app/frontend/src/pages/OrderDetailsAdmin.js` - Order details page
- `/app/frontend/src/pages/Settings.js` - Settings/configuration page

## Recent Changes (Jan 2026)

### Stage Fix Implementation
- **Fixed "Fulfilled" stage bug**: New Shopify orders with fulfilled status now correctly use the "Shipped" stage from workflow config instead of creating a non-existent "fulfilled" stage
- **Added helper functions**: `get_shipped_stage()` and `get_first_status_for_shipped_stage()` in server.py
- **Added `/api/admin/orders/fix-stages` endpoint**: One-time migration to fix historical data
- **Added UI button**: "Fix Order Stages (Fulfilled → Shipped)" in Settings → Integrations

### Previous Session Fixes
- MongoDB timeout optimization (connection settings, retry logic)
- Proof upload 16MB limit workaround (image compression, old proof clearing)
- Tracking number sync from Shopify fulfillments
- Workflow rules for tracking_added trigger
- Bulk tag sync to Shopify endpoint

## Pending Issues
1. **P0**: User needs to redeploy to push all fixes to production
2. **P1**: Bulk Shopify tag sync times out - needs background task refactoring
3. **P2**: Google Sheets sync not working (uninvestigated carry-over)

## Upcoming Tasks
- P1: Refactor bulk-sync to background task
- P1: Enhance export functionality
- P2: Email scheduler safeguards (dry run mode)
- P2: Real-time tracking API integration (Ship24)

## Backlog
- Workflow Import/Export functionality
- User-configurable timezone setting

## Test Credentials
- **Admin**: username: `admin`, password: `admin123`
