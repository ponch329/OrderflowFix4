"""
Settings management routes for tenant configuration
"""
from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
import os
from datetime import datetime, timezone

from models.tenant import TenantSettings
from models.user import Permission
from middleware.auth import AuthContext, get_current_user, require_permissions

router = APIRouter(prefix="/settings", tags=["Settings"])

def get_db():
    """Dependency to get database connection"""
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    return db

@router.get("/tenant")
async def get_tenant_settings(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Get current tenant settings
    Requires: VIEW_SETTINGS permission
    """
    tenant = await db.tenants.find_one(
        {"id": auth.tenant_id},
        {"_id": 0}
    )
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return {
        "tenant_id": tenant["id"],
        "name": tenant["name"],
        "settings": tenant.get("settings", {}),
        "smtp_configured": bool(tenant.get("smtp_user")),
        "shopify_configured": bool(tenant.get("shopify_access_token")),
        "google_sheets_configured": bool(tenant.get("google_client_id"))
    }

@router.patch("/tenant")
async def update_tenant_settings(
    update_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_SETTINGS)),
    db = Depends(get_db)
):
    """
    Update tenant settings and basic info (name)
    Requires: MANAGE_SETTINGS permission
    """
    tenant = await db.tenants.find_one(
        {"id": auth.tenant_id},
        {"_id": 0}
    )
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Prepare update document
    update_doc = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    # Update tenant name if provided
    if "name" in update_data:
        update_doc["name"] = update_data["name"]
    
    # Merge new settings with existing settings
    if "settings" in update_data:
        current_settings = tenant.get("settings", {})
        new_settings = update_data["settings"]
        merged_settings = {**current_settings, **new_settings}
        update_doc["settings"] = merged_settings
    
    # Update tenant
    await db.tenants.update_one(
        {"id": auth.tenant_id},
        {"$set": update_doc}
    )
    
    return {
        "message": "Settings updated successfully",
        "name": update_doc.get("name", tenant.get("name")),
        "settings": update_doc.get("settings", tenant.get("settings", {}))
    }

@router.post("/test-email")
async def send_test_email(
    email_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_SETTINGS)),
    db = Depends(get_db)
):
    """
    Send a test email to verify SMTP configuration
    Requires: MANAGE_SETTINGS permission
    """
    to_email = email_data.get("to_email")
    if not to_email:
        raise HTTPException(status_code=400, detail="to_email is required")
    
    # Get tenant config
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Create test email content
    subject = f"Test Email from {tenant['name']}"
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2196F3;">Test Email Successful! ✓</h2>
        <p>This is a test email from your proof approval system.</p>
        
        <div style="background: #f0f8ff; padding: 20px; border-left: 4px solid #2196F3; margin: 20px 0;">
            <p><strong>Tenant:</strong> {tenant['name']}</p>
            <p><strong>Sent by:</strong> {auth.user.full_name} ({auth.user.email})</p>
            <p><strong>Time:</strong> {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}</p>
        </div>
        
        <p>If you received this email, your SMTP configuration is working correctly!</p>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
            This is an automated test email from your proof approval system.
        </p>
    </body>
    </html>
    """
    
    try:
        from utils.helpers import send_email
        await send_email(tenant, to_email, subject, html_content)
        return {"message": f"Test email sent successfully to {to_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")

@router.get("/email-templates")
async def get_email_templates(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Get all available email templates with saved settings
    Requires: VIEW_SETTINGS permission
    """
    # Get tenant settings
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get saved email template settings
    saved_templates = tenant.get("settings", {}).get("email_templates", {})
    
    # Define all available template IDs
    template_ids = [
        "proof_ready_clay",
        "proof_ready_paint",
        "approved_clay",
        "approved_paint",
        "changes_requested_clay",
        "changes_requested_paint",
        "reminder"
    ]
    
    templates = []
    for template_id in template_ids:
        saved_data = saved_templates.get(template_id, {})
        templates.append({
            "id": template_id,
            "enabled": saved_data.get("enabled", True),
            "cc_email": saved_data.get("cc_email", ""),
            "bcc_email": saved_data.get("bcc_email", ""),
            "subject": saved_data.get("subject", ""),
            "body": saved_data.get("body", "")
        })
    
    return templates

@router.patch("/email-template/{template_id}")
async def update_email_template(
    template_id: str,
    template_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_SETTINGS)),
    db = Depends(get_db)
):
    """
    Update a specific email template
    Requires: MANAGE_SETTINGS permission
    """
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Get current settings
    current_settings = tenant.get("settings", {})
    
    # Initialize email_templates dict if it doesn't exist
    if "email_templates" not in current_settings:
        current_settings["email_templates"] = {}
    
    # Update the specific template
    current_settings["email_templates"][template_id] = {
        "enabled": template_data.get("enabled", True),
        "cc_email": template_data.get("cc_email", ""),
        "bcc_email": template_data.get("bcc_email", ""),
        "subject": template_data.get("subject", ""),
        "body": template_data.get("body", ""),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Save to database
    await db.tenants.update_one(
        {"id": auth.tenant_id},
        {
            "$set": {
                "settings": current_settings,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "Email template updated successfully",
        "template_id": template_id,
        "template": current_settings["email_templates"][template_id]
    }

@router.get("/manufacturer-fields")
async def get_manufacturer_visible_fields(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Get list of fields visible to manufacturers
    Requires: VIEW_SETTINGS permission
    """
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    settings = tenant.get("settings", {})
    visible_fields = settings.get("manufacturer_visible_fields", [
        "order_number",
        "customer_name",
        "stage",
        "clay_status",
        "paint_status",
        "clay_proofs",
        "paint_proofs"
    ])
    
    return {
        "visible_fields": visible_fields,
        "all_fields": [
            "order_number",
            "customer_name",
            "customer_email",
            "stage",
            "clay_status",
            "paint_status",
            "clay_proofs",
            "paint_proofs",
            "item_vendor",
            "notes",
            "shopify_order_id"
        ]
    }

@router.patch("/manufacturer-fields")
async def update_manufacturer_visible_fields(
    fields_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_SETTINGS)),
    db = Depends(get_db)
):
    """
    Update which fields are visible to manufacturers
    Requires: MANAGE_SETTINGS permission
    """
    visible_fields = fields_data.get("visible_fields", [])
    
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    # Update settings
    current_settings = tenant.get("settings", {})
    current_settings["manufacturer_visible_fields"] = visible_fields
    
    await db.tenants.update_one(
        {"id": auth.tenant_id},
        {
            "$set": {
                "settings": current_settings,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "Manufacturer visible fields updated",
        "visible_fields": visible_fields
    }
