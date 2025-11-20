# Shopify Tracking Integration Feature

## Overview
This feature automatically pulls tracking information from Shopify when an order moves to the "shipped" or "fulfilled" stage, and displays it throughout the application.

## How It Works

### 1. Automatic Tracking Fetch
When an admin changes an order's stage to "shipped" or "fulfilled":
1. System checks if order has a Shopify order ID
2. Connects to Shopify API using tenant credentials
3. Fetches fulfillment data including tracking information
4. Extracts tracking number, carrier, URL, and status
5. Updates order in database with tracking details

### 2. Tracking Data Stored
New fields added to Order model:
- `tracking_number` - The tracking number (e.g., "1Z999AA10123456784")
- `tracking_url` - Direct link to carrier tracking page
- `tracking_company` - Carrier name (UPS, FedEx, USPS, DHL, etc.)
- `shipment_status` - Current status (in_transit, delivered, out_for_delivery, etc.)
- `estimated_delivery` - Expected delivery date (if available)
- `shipped_at` - Timestamp when order was shipped

### 3. Display Locations

#### Admin Dashboard (Main Page)
- Shows tracking number as clickable hyperlink under customer email
- Format: "📦 Tracking: [1Z999AA10123456784]"
- Clicking opens tracking page in new tab
- Only visible if tracking information exists

#### Admin Order Details Page
- Shows tracking info below order number
- Format: "📦 Tracking: [1Z999AA10123456784] via UPS"
- Includes carrier name
- Clickable hyperlink to carrier tracking

#### Customer Order Portal
- Shows tracking in order header card
- Format: "📦 Tracking: [1Z999AA10123456784] (UPS) [IN TRANSIT]"
- Includes carrier and shipment status badge
- Clickable hyperlink for customer to track their order
- Status badge updates (e.g., "IN TRANSIT", "OUT FOR DELIVERY", "DELIVERED")

## Supported Carriers

The system automatically generates tracking URLs for:
- **UPS**: https://www.ups.com/track?tracknum=...
- **FedEx**: https://www.fedex.com/fedextrack/?trknbr=...
- **USPS**: https://tools.usps.com/go/TrackConfirmAction?tLabels=...
- **DHL**: https://www.dhl.com/en/express/tracking.html?AWB=...
- **Canada Post**: https://www.canadapost-postescanada.ca/track-reperage/...
- **Other carriers**: Falls back to Google search

## Implementation Files

### Backend
1. **`/app/backend/models/order.py`**
   - Added tracking fields to Order model

2. **`/app/backend/utils/tracking.py`** (NEW)
   - `fetch_shopify_tracking()` - Fetches tracking from Shopify API
   - `build_tracking_url()` - Builds carrier-specific tracking URLs
   - `update_order_tracking()` - Updates order with tracking info

3. **`/app/backend/server.py`**
   - Modified status update endpoint to trigger tracking fetch
   - Calls tracking utility when stage changes to shipped/fulfilled

### Frontend
1. **`/app/frontend/src/pages/AdminDashboard.js`**
   - Displays tracking number as hyperlink in order cards

2. **`/app/frontend/src/pages/OrderDetailsAdmin.js`**
   - Shows tracking info in page header

3. **`/app/frontend/src/pages/OrderDetails.js`**
   - Displays tracking in customer order header
   - Shows carrier, tracking number, and shipment status

## Usage

### For Admins
1. Order arrives from Shopify sync
2. Work through clay and paint stages
3. When ready to ship, change stage to "Shipped"
4. System automatically:
   - Fetches tracking from Shopify
   - Updates order record
   - Makes tracking visible to customer
5. Tracking link appears on dashboard and order details

### For Customers
1. Customer receives notification email (with tracking)
2. Customer visits order portal
3. Sees tracking number as clickable link in order header
4. Can track shipment directly with carrier
5. Status badge shows current delivery status

## Real-Time Delivery Updates

### Current Implementation
- Tracking information is fetched **once** when order moves to shipped stage
- Data comes from Shopify's fulfillment records
- Shows initial shipment status from Shopify

### Future Enhancement: Live Tracking Updates
To add real-time tracking updates, you would need to:

**Option 1: Periodic Polling**
- Create a background job (cron/celery)
- Every few hours, check Shopify for updated fulfillment status
- Update order records with new tracking status
- Requires: Background task scheduler

**Option 2: Third-Party Tracking API**
- Integrate with tracking services (AfterShip, EasyPost, ShipEngine)
- These services poll carriers and provide webhooks
- Update order status when webhook received
- Provides detailed tracking events (e.g., "Package left facility in Memphis")
- **Recommended for production**

**Option 3: Shopify Webhooks**
- Subscribe to `fulfillments/update` webhook
- Shopify notifies when tracking status changes
- Update order record immediately
- Most efficient but requires Shopify webhook setup

### Recommended: AfterShip Integration
```python
# Example integration (not implemented yet)
import aftership

# When order ships
tracking = aftership.tracking.create(
    tracking_number='1Z999AA10123456784',
    carrier_code='ups'
)

# Webhook endpoint receives updates
@app.post("/webhooks/aftership")
async def aftership_webhook(data: dict):
    tracking_number = data['tracking_number']
    status = data['tag']  # InTransit, OutForDelivery, Delivered
    
    await db.orders.update_one(
        {"tracking_number": tracking_number},
        {"$set": {"shipment_status": status}}
    )
```

## Configuration Requirements

### Shopify API Access
Required settings in tenant configuration:
- `shopify_shop_name` - Your Shopify store name
- `shopify_access_token` - Shopify Admin API access token

**Permissions Needed:**
- `read_orders` - To fetch order data
- `read_fulfillments` - To access tracking information

### How to Get Shopify API Credentials
1. Go to Shopify Admin
2. Settings → Apps and sales channels
3. Develop apps → Create an app
4. Configure Admin API scopes: `read_orders`, `read_fulfillments`
5. Install app and copy Admin API access token
6. Save to Settings → (need to add Shopify config UI)

## Testing

### Test with Manual Order
If you don't have Shopify:
1. Create a manual order
2. Add tracking info manually via API:
```bash
curl -X PATCH "http://localhost:8001/api/admin/orders/{order_id}/tracking" \
  -H "Content-Type: application/json" \
  -d '{
    "tracking_number": "1Z999AA10123456784",
    "tracking_company": "UPS",
    "tracking_url": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    "shipment_status": "in_transit"
  }'
```

### Test Tracking Display
1. Go to Admin Dashboard
2. Find an order
3. Look for "📦 Tracking: [number]" under customer info
4. Click tracking link - should open carrier site
5. View order details - tracking should appear in header
6. Customer portal - tracking should show with status badge

## Error Handling

### When Tracking Fetch Fails
- System logs error but doesn't block stage change
- Order still moves to shipped stage
- Tracking fields remain empty/null
- Admin can manually add tracking via order edit

### Common Issues
1. **"Shopify not configured"** - Missing API credentials
2. **"Order not found"** - Shopify order ID incorrect
3. **"No fulfillments"** - Order not yet fulfilled in Shopify
4. **"No tracking number"** - Shopify fulfillment doesn't have tracking

## Benefits

### For Admins
- ✅ Automatic tracking sync - no manual data entry
- ✅ Quick access to tracking from dashboard
- ✅ Reduced customer service inquiries
- ✅ Professional tracking presentation

### For Customers
- ✅ Immediate tracking visibility
- ✅ One-click access to carrier tracking
- ✅ Real-time status updates (with future enhancement)
- ✅ Reduced "where's my order?" anxiety
- ✅ Professional delivery experience

## Future Enhancements

### Phase 2 (Recommended)
1. **Manual Tracking Entry** - Allow admins to manually add tracking for manual orders
2. **Tracking Status Sync** - Periodic updates of delivery status
3. **Customer Notifications** - Email when tracking available and when delivered
4. **Delivery Estimates** - Show expected delivery date
5. **Tracking Timeline** - Show tracking history events

### Phase 3 (Advanced)
1. **Third-Party Integration** - AfterShip or EasyPost for live updates
2. **Delivery Proof** - Show signature images and delivery photos
3. **Exception Handling** - Alert on delivery delays or failed attempts
4. **Multi-Package Support** - Handle orders with multiple shipments
5. **International Tracking** - Support for customs and international carriers

## API Endpoints

### Fetch Tracking (Automatic)
```
PATCH /api/admin/orders/{order_id}/status
{
  "stage": "shipped"
}
```
Automatically triggers tracking fetch if Shopify order ID exists.

### Manual Tracking Update (Future)
```
PATCH /api/admin/orders/{order_id}/tracking
{
  "tracking_number": "1Z999AA10123456784",
  "tracking_company": "UPS",
  "tracking_url": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
  "shipment_status": "in_transit"
}
```

## Summary

The tracking integration provides a seamless experience for both admins and customers:
- **Automatic**: Pulls tracking from Shopify when order ships
- **Visible**: Shows tracking throughout the app
- **Clickable**: Direct links to carrier tracking
- **Professional**: Clean, branded presentation
- **Scalable**: Ready for real-time updates enhancement

This eliminates manual tracking entry and provides customers with immediate visibility into their order's delivery status.
