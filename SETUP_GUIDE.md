# Bobblehead Order Approval System - Setup Guide

## Overview
This system allows customers to view their bobblehead order progress, review proofs at different stages (clay and paint), and either approve or request changes. Admin can sync orders from Shopify, upload proofs, and manage the entire workflow.

## Features
✅ Customer order lookup by email + order number
✅ Admin dashboard with Shopify order sync
✅ Multi-stage approval workflow (Clay → Paint → Shipped)
✅ Image upload with ZIP support (auto-extracts images)
✅ Customer approval or change request with additional images
✅ Email notifications (SMTP)
✅ Google Sheets logging for all status changes
✅ Responsive, modern UI with Shadcn components

---

## System Architecture

### Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React with Shadcn UI
- **Database**: MongoDB
- **Integrations**: 
  - Shopify API (order sync)
  - Google Sheets API (logging)
  - SMTP (email notifications)

### Data Flow
1. **Admin syncs orders** from Shopify → Stored in MongoDB
2. **Admin uploads proofs** (images/ZIP) → Attached to order stages
3. **Customer looks up order** → Views proofs and current stage
4. **Customer approves/requests changes** → Email sent to admin + logged to Google Sheets
5. **Order progresses** through stages: Clay → Paint → Shipped

---

## Required API Keys and Credentials

### 1. Shopify API Credentials

You need to create a **Shopify Private App** or **Custom App** to get API access:

#### Steps to Get Shopify Credentials:

**Option A: Custom App (Recommended for Shopify Partners)**
1. Go to https://partners.shopify.com/
2. Create/Login to your Partner account
3. Apps → Create app → Custom app
4. Select your store (allbobbleheads.myshopify.com)
5. Configure API scopes:
   - `read_orders`
   - `read_customers`
6. Install app on your store
7. Get your **Admin API access token**

**Option B: Private App (Legacy - Simpler)**
1. Login to your Shopify admin: https://allbobbleheads.myshopify.com/admin
2. Go to Settings → Apps and sales channels → Develop apps
3. Click "Create an app"
4. Name it "Order Approval System"
5. Configure Admin API scopes:
   - `read_orders`
   - `read_customers`
6. Install app
7. Get your credentials:
   - **Admin API access token**: This is your `SHOPIFY_ACCESS_TOKEN`
   - **API key**: This is your `SHOPIFY_API_KEY`
   - **API secret**: This is your `SHOPIFY_API_SECRET`

**What you need to provide:**
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_ACCESS_TOKEN`
- Store name is already set as: `allbobbleheads`

---

### 2. Google Sheets API Setup

For logging all order status changes, approvals, and change requests.

#### Steps:

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com
   - Create a new project: "Bobblehead Order System"

2. **Enable Google Sheets API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

3. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" → Create
   - Fill in:
     - App name: "Bobblehead Order System"
     - User support email: your email
     - Developer email: your email
   - Scopes → Add: `https://www.googleapis.com/auth/spreadsheets`
   - Test users → Add your Google email
   - Save

4. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "Bobblehead Order System"
   - Authorized redirect URIs:
     ```
     https://proof-approval-hub.preview.emergentagent.com/api/oauth/sheets/callback
     ```
   - Click "Create"
   - Download credentials or copy:
     - **Client ID**: This is your `GOOGLE_CLIENT_ID`
     - **Client Secret**: This is your `GOOGLE_CLIENT_SECRET`

5. **Create a Google Sheet**
   - Go to https://sheets.google.com
   - Create a new spreadsheet
   - Name it: "Bobblehead Orders Log"
   - Add headers in first row: `Timestamp | Order Number | Action | Details`
   - Copy the Spreadsheet ID from URL:
     ```
     https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
     ```

6. **Authorize the App**
   - After setting up credentials in the system
   - Visit: `https://proof-approval-hub.preview.emergentagent.com/api/oauth/sheets/login`
   - Login with your Google account
   - Grant permissions

**What you need to provide:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SPREADSHEET_ID`
- `SHEETS_REDIRECT_URI` = `https://proof-approval-hub.preview.emergentagent.com/api/oauth/sheets/callback`

---

### 3. SMTP Email Configuration

For sending professional approval/change request notifications.

#### Option A: Gmail (Easiest)

1. Enable 2-Factor Authentication on your Google account
2. Generate App Password:
   - Go to https://myaccount.google.com/security
   - 2-Step Verification → App passwords
   - Select "Mail" and your device
   - Generate password
3. Use these settings:
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = your Gmail address
   - `SMTP_PASSWORD` = the app password (16 characters)
   - `SMTP_FROM_EMAIL` = your Gmail address

#### Option B: Business Email (Custom SMTP)

Contact your email provider for SMTP settings. Common providers:
- **Microsoft 365**: `smtp.office365.com:587`
- **GoDaddy**: `smtpout.secureserver.net:587`
- **Other**: Check with your hosting provider

**What you need to provide:**
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

---

## Environment Configuration

All credentials go in: `/app/backend/.env`

```env
# Shopify Configuration
SHOPIFY_API_KEY="your_api_key_here"
SHOPIFY_API_SECRET="your_api_secret_here"
SHOPIFY_SHOP_NAME="allbobbleheads"
SHOPIFY_ACCESS_TOKEN="your_access_token_here"

# Google Sheets Configuration
GOOGLE_CLIENT_ID="your_client_id_here"
GOOGLE_CLIENT_SECRET="your_client_secret_here"
SHEETS_REDIRECT_URI="https://proof-approval-hub.preview.emergentagent.com/api/oauth/sheets/callback"
SPREADSHEET_ID="your_spreadsheet_id_here"

# SMTP Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your_email@gmail.com"
SMTP_PASSWORD="your_app_password_here"
SMTP_FROM_EMAIL="your_email@gmail.com"
```

**After adding credentials, restart backend:**
```bash
sudo supervisorctl restart backend
```

---

## How to Use the System

### Admin Workflow

1. **Access Admin Dashboard**
   - Go to https://proof-approval-hub.preview.emergentagent.com
   - Click "Admin Dashboard"

2. **Sync Orders from Shopify**
   - Click "Sync from Shopify" button
   - System pulls all orders and stores them

3. **Upload Proofs**
   - Click "Upload Proofs" on any order
   - Select stage (Clay or Paint)
   - Upload individual images OR a ZIP file containing multiple images
   - System auto-extracts ZIP files

4. **Track Order Status**
   - View all orders and their current stage
   - See approval status for each stage
   - View customer change requests

### Customer Workflow

1. **Access Customer Portal**
   - Go to https://proof-approval-hub.preview.emergentagent.com
   - Click "Customer Portal"

2. **Lookup Order**
   - Enter email address (used in Shopify order)
   - Enter order number (e.g., #1234)
   - Click "View My Order"

3. **Review Proofs**
   - View current stage (Clay, Paint, or Shipped)
   - See all proof images for current stage
   - Click images to enlarge

4. **Approve or Request Changes**
   - **Approve**: Click "Approve" button → Email sent to admin → Order moves to next stage
   - **Request Changes**: 
     - Click "Request Changes"
     - Type what needs to be changed
     - Optionally attach reference images
     - Submit → Email sent to admin with details

---

## Email Templates

### Approval Email
```
Subject: Order #1234 - Clay Stage Approved

✓ Clay Stage Approved

Order Number: 1234
Customer: John Doe (john@example.com)

The customer has approved the clay stage proofs.
```

### Change Request Email
```
Subject: Order #1234 - Clay Stage Changes Requested

⚠ Changes Requested

Order Number: 1234
Customer: John Doe (john@example.com)

Requested Changes:
Please make the eyes slightly bigger and adjust the smile.

Additional Images Attached: 2
```

---

## Google Sheets Logging

All actions are logged to Google Sheets with:
- **Timestamp**: When the action occurred
- **Order Number**: Which order
- **Action**: "Approved", "Changes Requested", "Proofs Uploaded"
- **Details**: Additional information (stage, message, etc.)

Example:
```
2025-01-13 10:30:00 | 1234 | Proofs Uploaded - clay | 4 images
2025-01-13 11:15:00 | 1234 | Approved | Clay
2025-01-13 14:20:00 | 1234 | Proofs Uploaded - paint | 3 images
2025-01-13 15:30:00 | 1234 | Changes Requested | Paint - Please adjust the hair color
```

---

## API Endpoints

### Customer Endpoints
- `GET /api/customer/lookup?email={email}&order_number={number}` - Lookup order
- `POST /api/customer/orders/{order_id}/approve?stage={stage}` - Approve or request changes

### Admin Endpoints
- `GET /api/admin/orders` - Get all orders
- `POST /api/admin/sync-orders` - Sync from Shopify
- `POST /api/admin/orders/{order_id}/proofs` - Upload proofs (multipart form data)

### OAuth
- `GET /api/oauth/sheets/login` - Initiate Google Sheets OAuth
- `GET /api/oauth/sheets/callback` - OAuth callback

---

## Troubleshooting

### Orders Not Syncing
- Verify Shopify credentials in `.env`
- Check backend logs: `tail -n 100 /var/log/supervisor/backend.*.log`
- Ensure API scopes include `read_orders` and `read_customers`

### Google Sheets Not Logging
- Complete OAuth flow: Visit `/api/oauth/sheets/login`
- Verify redirect URI matches exactly in Google Cloud Console
- Check that spreadsheet ID is correct

### Emails Not Sending
- For Gmail: Ensure 2FA is enabled and using App Password
- Test SMTP connection manually
- Check backend logs for email errors

### Images Not Displaying
- Images are stored as base64 in MongoDB (for MVP)
- For production, consider using AWS S3 or Cloudinary
- Check file size limits

---

## Production Recommendations

When ready for production, consider:

1. **Image Storage**: 
   - Move from base64 to cloud storage (AWS S3, Cloudinary)
   - Implement image optimization and CDN

2. **Shopify Webhooks**:
   - Instead of manual sync, use Shopify webhooks for real-time order updates
   - Webhook endpoints: `/orders/create`, `/orders/updated`

3. **Security**:
   - Add admin authentication
   - Implement rate limiting
   - Add CAPTCHA to customer lookup

4. **Email Automation**:
   - Set up email templates in a service like SendGrid or Mailgun
   - Add email tracking and analytics

5. **Monitoring**:
   - Set up error tracking (Sentry)
   - Add application monitoring
   - Create dashboards for order metrics

---

## Support

For issues or questions:
- Check backend logs: `/var/log/supervisor/backend.*.log`
- Check frontend logs: `/var/log/supervisor/frontend.*.log`
- Review this guide for credential setup

---

## Next Steps

1. ✅ Set up Shopify API credentials
2. ✅ Configure Google Sheets API
3. ✅ Set up SMTP email
4. ✅ Test order sync
5. ✅ Upload test proofs
6. ✅ Test customer workflow
7. ✅ Verify emails are sent
8. ✅ Verify Google Sheets logging

---

**System URL**: https://proof-approval-hub.preview.emergentagent.com
**Admin Dashboard**: https://proof-approval-hub.preview.emergentagent.com/admin
**Customer Portal**: https://proof-approval-hub.preview.emergentagent.com/customer
