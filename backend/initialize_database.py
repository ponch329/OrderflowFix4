"""
Initialize database with tenant, admin user, and sample data
Run this script to set up a fresh database
"""
import os
import sys
import asyncio
from datetime import datetime, timezone
from uuid import uuid4
import bcrypt

sys.path.insert(0, '/app/backend')

os.environ['MONGO_URL'] = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
os.environ['DB_NAME'] = os.environ.get('DB_NAME', 'bobblehead')

from motor.motor_asyncio import AsyncIOMotorClient

async def initialize_database():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    
    print("=" * 60)
    print("DATABASE INITIALIZATION")
    print("=" * 60)
    
    # Check existing data
    tenant_count = await db.tenants.count_documents({})
    user_count = await db.users.count_documents({})
    
    print(f"\nCurrent state:")
    print(f"  Tenants: {tenant_count}")
    print(f"  Users: {user_count}")
    
    if tenant_count > 0 or user_count > 0:
        print("\n⚠️  Database already has data!")
        response = input("Do you want to reinitialize? This will delete existing data (y/N): ")
        if response.lower() != 'y':
            print("Cancelled.")
            client.close()
            return
        
        # Drop collections
        print("\nDropping existing collections...")
        await db.tenants.drop()
        await db.users.drop()
        await db.orders.drop()
        print("✅ Collections dropped")
    
    # Create tenant ID
    tenant_id = str(uuid4())
    
    print(f"\n📦 Creating tenant...")
    print(f"   Tenant ID: {tenant_id}")
    
    # Create tenant with full configuration
    tenant = {
        "id": tenant_id,
        "name": "All Bobbleheads",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "settings": {
            "logo_url": "",
            "primary_color": "#2196F3",
            "secondary_color": "#9C27B0",
            "font_family": "Arial, sans-serif",
            "font_size_base": "16px",
            "customer_portal_url": None,
            "bcc_email": None,
            "email_templates_enabled": True,
            "email_templates": [
                {
                    "id": "proof_ready_clay",
                    "name": "Clay Proofs Ready",
                    "subject": "Your Clay Proofs are Ready - Order #{order_number}",
                    "body": """<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2196F3;">Your Clay Proofs are Ready!</h2>
    <p>Hi {customer_name},</p>
    <p>Great news! Your clay proofs for order <strong>#{order_number}</strong> are ready for your review.</p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{portal_url}" style="background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Proofs</a>
    </div>
    <p>Please review the proofs and let us know if you approve or if any changes are needed.</p>
    <p>Best regards,<br>{company_name}</p>
</body>
</html>""",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                },
                {
                    "id": "proof_ready_paint",
                    "name": "Paint Proofs Ready",
                    "subject": "Your Paint Proofs are Ready - Order #{order_number}",
                    "body": """<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #2196F3;">Your Paint Proofs are Ready!</h2>
    <p>Hi {customer_name},</p>
    <p>Your paint proofs for order <strong>#{order_number}</strong> are now ready for review.</p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{portal_url}" style="background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Proofs</a>
    </div>
    <p>Please review and approve, or let us know if any adjustments are needed.</p>
    <p>Best regards,<br>{company_name}</p>
</body>
</html>""",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                },
                {
                    "id": "clay_approved",
                    "name": "Clay Approved (Admin Notification)",
                    "subject": "Clay Approved - Order #{order_number}",
                    "body": "<p>Customer {customer_name} has approved the clay proofs for order #{order_number}.</p>",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                },
                {
                    "id": "paint_approved",
                    "name": "Paint Approved (Admin Notification)",
                    "subject": "Paint Approved - Order #{order_number}",
                    "body": "<p>Customer {customer_name} has approved the paint proofs for order #{order_number}.</p>",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                },
                {
                    "id": "changes_requested_clay",
                    "name": "Clay Changes Requested (Admin Notification)",
                    "subject": "Changes Requested - Clay Stage - Order #{order_number}",
                    "body": "<p>Customer {customer_name} has requested changes for clay proofs on order #{order_number}.</p><p>Message: {customer_message}</p>",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                },
                {
                    "id": "changes_requested_paint",
                    "name": "Paint Changes Requested (Admin Notification)",
                    "subject": "Changes Requested - Paint Stage - Order #{order_number}",
                    "body": "<p>Customer {customer_name} has requested changes for paint proofs on order #{order_number}.</p><p>Message: {customer_message}</p>",
                    "enabled": True,
                    "cc_email": "",
                    "bcc_email": ""
                }
            ],
            "workflow": {
                "stages": ["clay", "paint", "shipped", "fulfilled", "canceled"],
                "statuses": ["pending", "sculpting", "feedback_needed", "changes_requested", "approved"],
                "stage_labels": {
                    "clay": "Clay Stage",
                    "paint": "Paint Stage",
                    "shipped": "Shipped",
                    "fulfilled": "Fulfilled",
                    "canceled": "Canceled"
                },
                "status_labels": {
                    "pending": "Pending",
                    "sculpting": "In Progress",
                    "feedback_needed": "Feedback Needed",
                    "changes_requested": "Changes Requested",
                    "approved": "Approved"
                }
            }
        }
    }
    
    await db.tenants.insert_one(tenant)
    print(f"✅ Tenant created: {tenant['name']}")
    print(f"   Email templates: {len(tenant['settings']['email_templates'])}")
    
    # Create admin user
    print(f"\n👤 Creating admin user...")
    admin_password = "admin123"
    password_hash = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    admin_user = {
        "id": str(uuid4()),
        "username": "admin",
        "email": "admin@allbobbleheads.com",
        "password_hash": password_hash,
        "full_name": "Admin User",
        "role": "main_admin",
        "tenant_id": tenant_id,
        "permissions": [
            "view_all_orders",
            "edit_orders",
            "manage_users",
            "manage_settings",
            "view_analytics",
            "manage_vendors",
            "view_proofs",
            "upload_proofs",
            "view_notes"
        ],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(admin_user)
    print(f"✅ Admin user created")
    print(f"   Username: admin")
    print(f"   Password: admin123")
    print(f"   Email: admin@allbobbleheads.com")
    
    # Create sample order
    print(f"\n📦 Creating sample order...")
    sample_order = {
        "id": str(uuid4()),
        "tenant_id": tenant_id,
        "order_number": "SAMPLE-001",
        "customer_name": "John Doe",
        "customer_email": "john@example.com",
        "item_vendor": "Sample Vendor",
        "stage": "clay",
        "clay_status": "sculpting",
        "paint_status": "pending",
        "clay_proofs": [],
        "paint_proofs": [],
        "clay_approval": None,
        "paint_approval": None,
        "notes": [],
        "timeline": [
            {
                "id": str(uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": "order_created",
                "user_name": "Admin User",
                "user_role": "admin",
                "description": "Order created",
                "metadata": {}
            }
        ],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "last_updated_by": "admin",
        "last_updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.insert_one(sample_order)
    print(f"✅ Sample order created: {sample_order['order_number']}")
    
    print("\n" + "=" * 60)
    print("✅ DATABASE INITIALIZATION COMPLETE!")
    print("=" * 60)
    print("\nYou can now:")
    print("  1. Login with username: admin, password: admin123")
    print("  2. Access email templates at /admin/email-templates")
    print("  3. Configure SMTP settings at /admin/settings")
    print("  4. View the sample order on the dashboard")
    print("\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(initialize_database())
