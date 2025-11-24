# Fix Customer Portal URL in Production (Deployed Version)

## Quick Fix - Update MongoDB Directly

### Step 1: Connect to Your Production MongoDB
You'll need to access your MongoDB database (Atlas or wherever it's deployed).

### Step 2: Run This Update Command

**Option A - If you know your Tenant ID:**
```javascript
db.tenants.updateOne(
  { id: "your-tenant-id" },
  { 
    $set: { 
      "settings.customer_portal_url": "https://your-deployed-app.emergent.host/customer" 
    } 
  }
)
```

**Option B - If you only have one tenant (most common):**
```javascript
db.tenants.updateOne(
  {},  // Empty filter = first/only tenant
  { 
    $set: { 
      "settings.customer_portal_url": "https://your-deployed-app.emergent.host/customer" 
    } 
  }
)
```

**Option C - Update ALL tenants:**
```javascript
db.tenants.updateMany(
  {},  // All tenants
  { 
    $set: { 
      "settings.customer_portal_url": "https://your-deployed-app.emergent.host/customer" 
    } 
  }
)
```

### Step 3: Replace the URL
Change `https://your-deployed-app.emergent.host/customer` to your actual deployed URL:
- If using Emergent deployment: `https://approvehub.emergent.host/customer`
- If using custom domain: `https://portal.yourdomain.com/customer`

### Step 4: Verify
Upload proofs to test order → Check email → Customer portal link should now show your correct URL.

---

## Alternative: Edit Default in Deployed Code

If you have SSH/console access to your deployed container:

### Step 1: Access the Container
```bash
kubectl exec -it <pod-name> -- /bin/bash
```

### Step 2: Edit the Email Template
```bash
nano /app/backend/email_templates.py
```

### Step 3: Find Line 279
```python
def get_customer_proofs_ready_email(order_number, customer_name, stage, num_images, portal_url="https://proofs.allbobbleheads.com/customer", logo_url=None, company_name=""):
```

### Step 4: Change to Your URL
```python
def get_customer_proofs_ready_email(order_number, customer_name, stage, num_images, portal_url="https://approvehub.emergent.host/customer", logo_url=None, company_name=""):
```

### Step 5: Restart the Backend
```bash
supervisorctl restart backend
```

**Note:** This change will be lost when you redeploy. Better to use the database method.

---

## MongoDB Connection Methods

### Using MongoDB Compass (GUI)
1. Get your `MONGO_URL` from Emergent secrets/environment
2. Open MongoDB Compass
3. Connect using the URL
4. Navigate to your database → `tenants` collection
5. Find your tenant document
6. Edit the document and add:
   ```json
   {
     "settings": {
       "customer_portal_url": "https://your-app.emergent.host/customer"
     }
   }
   ```
7. Save

### Using MongoDB Shell
```bash
# Connect
mongosh "your-connection-string"

# Switch to database
use bobblehead  # or your DB name

# Update tenant
db.tenants.updateOne(
  {},
  { $set: { "settings.customer_portal_url": "https://approvehub.emergent.host/customer" } }
)

# Verify
db.tenants.find({}, { "settings.customer_portal_url": 1 })
```

### Using Emergent Console
If Emergent provides a database console:
1. Go to your app dashboard
2. Click "Database" or "MongoDB"
3. Run the update query above

---

## Finding Your Deployed URL

Your deployed URL should be:
- Backend: `https://approvehub.emergent.host` (from error logs)
- Frontend: Same domain
- Customer Portal: `https://approvehub.emergent.host/customer`

---

## Important Notes

### Current Behavior (Deployed Version)
The deployed code currently uses the hardcoded default:
```
https://proofs.allbobbleheads.com/customer
```

### After Database Update
Once you set `customer_portal_url` in the database, it will use your custom URL.

### After Redeployment
When you redeploy with the latest code from this session, it will:
1. Check tenant settings for `customer_portal_url`
2. If set → use it
3. If not set → automatically use your deployment URL

---

## Recommended Steps

1. **Immediate Fix:** Update MongoDB database with your portal URL
2. **Test:** Upload proofs and verify email has correct link
3. **Later:** Redeploy with latest code for better handling
4. **Future:** Add UI field in Admin Settings for easy changes

---

## Verification Query

To check if the setting is correctly saved:

```javascript
db.tenants.find({}, { 
  name: 1, 
  "settings.customer_portal_url": 1 
})
```

Expected output:
```json
{
  "_id": ObjectId("..."),
  "name": "Your Company Name",
  "settings": {
    "customer_portal_url": "https://approvehub.emergent.host/customer"
  }
}
```

---

## Summary

**Fastest Solution:** Update MongoDB database directly
- No redeployment needed
- Works immediately
- Persists across restarts

**Query:**
```javascript
db.tenants.updateOne({}, { 
  $set: { "settings.customer_portal_url": "https://approvehub.emergent.host/customer" } 
})
```

This will fix the customer portal link in all future emails! 🎉
