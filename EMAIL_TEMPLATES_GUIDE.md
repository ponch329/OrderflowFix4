# Email Template Customization Guide

## Overview
Email templates are located in `/app/backend/email_templates.py`

The system uses professional HTML email templates that you can fully customize to match your brand.

---

## Available Templates

### 1. **Approval Email** (`get_approval_email`)
Sent when customer approves clay or paint stage.

**Variables you can customize:**
- Colors (currently green #4CAF50)
- Header text and styling
- Footer information
- Company branding
- "Next Steps" messaging

### 2. **Changes Requested Email** (`get_changes_requested_email`)
Sent when customer requests changes.

**Variables you can customize:**
- Colors (currently orange #FF9800)
- Header text and styling
- Message box styling
- Footer information
- Action required text

### 3. **Proofs Uploaded Notification** (optional, currently not used)
Can be enabled to notify you when proofs are uploaded.

---

## How to Edit Templates

### Step 1: Open the template file
```bash
# File location
/app/backend/email_templates.py
```

### Step 2: Find the template function you want to edit
- `get_approval_email()` - For approvals
- `get_changes_requested_email()` - For change requests

### Step 3: Customize the HTML
You can change:
- **Colors**: Search for hex codes like `#4CAF50` and replace
- **Text**: Edit any text between `>` and `</`
- **Layout**: Modify the HTML structure
- **Branding**: Add your logo, change fonts, etc.

### Step 4: Restart backend to apply changes
```bash
sudo supervisorctl restart backend
```

---

## Common Customizations

### Change Brand Colors

**Approval emails (Green):**
```python
# Find these lines and change the color codes:
background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
color: #4CAF50;
border-left: 4px solid #4CAF50;
```

**Change request emails (Orange):**
```python
# Find these lines and change the color codes:
background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
color: #FF9800;
border-left: 4px solid #FF9800;
```

---

### Add Your Logo

Add this inside the `.header` section:
```html
<div class="header">
    <img src="https://yourwebsite.com/logo.png" alt="Company Logo" style="width: 150px; margin-bottom: 15px;">
    <div class="checkmark">✓</div>
    <h1>{stage.capitalize()} Stage Approved</h1>
</div>
```

---

### Change Footer Information

Find the `.footer` section and customize:
```html
<div class="footer">
    <p>Your custom footer text here</p>
    <p>YourCompany.com | contact@yourcompany.com | (555) 123-4567</p>
    <p><a href="https://yourwebsite.com">Visit our website</a></p>
</div>
```

---

### Change Font

Add to the `<style>` section:
```css
body {
    font-family: 'Georgia', 'Times New Roman', serif;
    /* or */
    font-family: 'Helvetica', 'Arial', sans-serif;
}
```

---

### Add Social Media Links

Add before closing `</div>` in footer:
```html
<div style="margin-top: 15px;">
    <a href="https://facebook.com/yourpage" style="margin: 0 10px;">Facebook</a>
    <a href="https://instagram.com/yourpage" style="margin: 0 10px;">Instagram</a>
    <a href="https://twitter.com/yourpage" style="margin: 0 10px;">Twitter</a>
</div>
```

---

## Testing Email Templates

After making changes, you can test by:

1. Upload proofs to a test order
2. Use customer portal to approve or request changes
3. Check your email (orders@allbobbleheads.com)

Or use this Python test script:

```python
cd /app/backend
python3 << 'EOF'
import asyncio
from email_templates import get_approval_email, get_changes_requested_email

# Test approval email
subject, html = get_approval_email("TEST123", "John Doe", "test@email.com", "clay")
print("Approval Email Subject:", subject)
print("First 200 chars:", html[:200])

# Test change request email
subject, html = get_changes_requested_email("TEST123", "John Doe", "test@email.com", "paint", "Please adjust the eyes", 2)
print("\nChange Request Subject:", subject)
print("First 200 chars:", html[:200])
EOF
```

---

## Advanced: Add Custom Variables

You can add new parameters to the template functions:

**Example: Add order date**

1. Edit function signature:
```python
def get_approval_email(order_number, customer_name, customer_email, stage, order_date):
```

2. Use in template:
```html
<div class="info-row">
    <span class="label">Order Date:</span> {order_date}
</div>
```

3. Update call in server.py:
```python
subject, html_content = get_approval_email(
    order['order_number'],
    order['customer_name'],
    order['customer_email'],
    stage,
    order['created_at']  # Add new parameter
)
```

---

## Tips

1. **Always backup before editing** - Copy the file before making changes
2. **Test in Gmail/Outlook** - Different email clients render HTML differently
3. **Keep it simple** - Complex HTML may not render well in all email clients
4. **Use inline CSS** - Email clients don't support external stylesheets
5. **Test responsiveness** - Make sure emails look good on mobile

---

## Need Help?

If you break something:
1. Copy the original template back from this guide
2. Restart backend: `sudo supervisorctl restart backend`
3. The original templates are also in `/app/SETUP_GUIDE.md`

---

## File Location Summary

- **Templates**: `/app/backend/email_templates.py`
- **Main server**: `/app/backend/server.py` (imports templates)
- **This guide**: `/app/EMAIL_TEMPLATES_GUIDE.md`

After editing templates, always restart backend:
```bash
sudo supervisorctl restart backend
```
