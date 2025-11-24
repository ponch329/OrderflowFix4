# How to Change the Customer Portal Link in Email Templates

## Overview
The Customer Portal Link appears in automated emails sent to customers when proofs are ready for review. This link directs customers to view and approve their proofs.

---

## Current Setup

**Default URL:** The system now automatically uses your frontend URL + `/customer` path.

**Example:**
- If your backend URL is `https://yourapp.emergent.host`
- Customer portal link will be: `https://yourapp.emergent.host/customer`

---

## Method 1: Use the Admin Settings (Recommended)

### Step 1: Go to Admin Settings
1. Login as admin
2. Navigate to `/admin/settings`
3. Click on the **"Branding"** tab

### Step 2: Add Customer Portal URL Field
Currently, this field needs to be added to the settings UI. For now, you can set it directly in the database:

```javascript
// Connect to your MongoDB database
db.tenants.updateOne(
  { id: "your-tenant-id" },
  { 
    $set: { 
      "settings.customer_portal_url": "https://your-custom-domain.com/customer" 
    } 
  }
)
```

### Step 3: Verify
Once set, all future emails will use your custom customer portal URL.

---

## Method 2: Change the Default in Code

### Quick Fix: Edit the Email Template File

**File:** `/app/backend/email_templates.py`

**Line 279:** Find this line:
```python
def get_customer_proofs_ready_email(order_number, customer_name, stage, num_images, portal_url="https://proofs.allbobbleheads.com/customer", logo_url=None, company_name=""):
```

**Change to:**
```python
def get_customer_proofs_ready_email(order_number, customer_name, stage, num_images, portal_url="https://YOUR-DOMAIN.com/customer", logo_url=None, company_name=""):
```

Replace `https://YOUR-DOMAIN.com/customer` with your actual customer portal URL.

---

## How It Works

### Email Sending Logic
When proofs are uploaded, the system:

1. Gets the tenant settings from the database
2. Checks if `customer_portal_url` is configured in settings
3. If YES → Uses the custom URL
4. If NO → Falls back to: `{backend_url}/customer`

### Code Reference
**File:** `/app/backend/utils/helpers.py` (lines ~138-145)

```python
# Get customer portal URL from tenant settings or use backend URL as fallback
backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:3000')
frontend_url = backend_url.replace('/api', '')
portal_url = tenant.get("settings", {}).get("customer_portal_url", f"{frontend_url}/customer")

subject, html_content = get_customer_proofs_ready_email(
    order['order_number'],
    order.get('customer_name', 'Valued Customer'),
    stage,
    proof_count,
    portal_url=portal_url,  # <-- Custom URL used here
    logo_url=logo_url,
    company_name=company_name
)
```

---

## Testing Your Changes

### 1. Check Current URL
Upload proofs to an order and check the email sent to the customer. The "View Your Proofs" button should use your configured URL.

### 2. Test Email
Go to Admin → Settings → Email Templates → Click "Send Test" on any template to verify the link.

### 3. Verify in Email
Open the test email and click the "View Your Proofs" button. It should navigate to your custom portal URL.

---

## Common Portal URL Patterns

Depending on your setup, you might use:

### Same Domain (Default)
```
https://yourapp.emergent.host/customer
```

### Custom Domain
```
https://portal.yourdomain.com/customer
```

### Subdomain
```
https://customer.yourdomain.com
```

---

## Adding UI for Customer Portal URL

To add this field to the Admin Settings UI:

### File: `/app/frontend/src/pages/Settings.js` (Branding Tab)

Add this input field in the branding section:

```javascript
<div>
  <Label>Customer Portal URL</Label>
  <Input
    value={branding.customer_portal_url || ''}
    onChange={(e) => setBranding({
      ...branding,
      customer_portal_url: e.target.value
    })}
    placeholder="https://yourapp.com/customer"
  />
  <p className="text-xs text-gray-500 mt-1">
    URL customers use to view their proofs (used in email links)
  </p>
</div>
```

---

## Troubleshooting

### Email still shows old URL
1. Clear browser cache
2. Check database to verify the setting is saved
3. Test by uploading new proofs

### URL is empty in emails
1. Check that `customer_portal_url` is set in tenant settings
2. Verify your `REACT_APP_BACKEND_URL` environment variable is correct
3. Check backend logs for any errors

### Link doesn't work
1. Verify the URL is accessible (not behind auth)
2. Check that `/customer` route exists in your frontend
3. Test the URL directly in a browser

---

## Summary

**Current Implementation:**
✅ System automatically uses your deployment URL + `/customer`
✅ Can override with custom URL via tenant settings
✅ Fallback to environment variable if custom URL not set

**To Change:**
1. **Quick:** Edit default in `/app/backend/email_templates.py` line 279
2. **Flexible:** Set `customer_portal_url` in database tenant settings
3. **Best:** Add UI field in Admin Settings → Branding tab (requires frontend update)

**The customer portal URL is now configurable and will use your custom domain when set!**
