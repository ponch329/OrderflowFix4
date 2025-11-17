"""
Database migration utility for converting single-tenant to multi-tenant architecture
"""
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import hashlib
import os
from typing import Dict, Any

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.tenant import Tenant, TenantSettings
from models.user import User, UserRole

async def create_default_tenant(db, existing_env_vars: Dict[str, Any]) -> str:
    """
    Create the first tenant (Tenant #1) using existing environment variables
    Returns tenant_id
    """
    # Check if default tenant already exists
    existing_tenant = await db.tenants.find_one({"name": "AllBobbleheads"})
    if existing_tenant:
        print("Default tenant already exists")
        return existing_tenant["id"]
    
    tenant_id = str(uuid.uuid4())
    
    tenant_data = {
        "id": tenant_id,
        "name": "AllBobbleheads",
        "subdomain": None,
        
        # Copy existing Shopify config
        "shopify_shop_name": existing_env_vars.get("SHOPIFY_SHOP_NAME"),
        "shopify_api_key": existing_env_vars.get("SHOPIFY_API_KEY"),
        "shopify_api_secret": existing_env_vars.get("SHOPIFY_API_SECRET"),
        "shopify_access_token": existing_env_vars.get("SHOPIFY_ACCESS_TOKEN"),
        
        # Copy existing Google Sheets config
        "google_client_id": existing_env_vars.get("GOOGLE_CLIENT_ID"),
        "google_client_secret": existing_env_vars.get("GOOGLE_CLIENT_SECRET"),
        "spreadsheet_id": existing_env_vars.get("SPREADSHEET_ID"),
        
        # Copy existing SMTP config
        "smtp_host": existing_env_vars.get("SMTP_HOST", "smtp.gmail.com"),
        "smtp_port": int(existing_env_vars.get("SMTP_PORT", "587")),
        "smtp_user": existing_env_vars.get("SMTP_USER"),
        "smtp_password": existing_env_vars.get("SMTP_PASSWORD"),
        "smtp_from_email": existing_env_vars.get("SMTP_FROM_EMAIL"),
        
        # Default settings
        "settings": {
            "logo_url": None,
            "primary_color": "#2196F3",
            "secondary_color": "#9C27B0",
            "font_family": "Arial, sans-serif",
            "font_size_base": "16px",
            "bcc_email": None,
            "email_templates_enabled": True,
            "manufacturer_visible_fields": [
                "order_number",
                "customer_name",
                "stage",
                "clay_status",
                "paint_status",
                "clay_proofs",
                "paint_proofs"
            ],
            "manufacturer_can_change_status": False,
            "manufacturer_can_add_notes": True,
            "notes_visible_to_customer": False
        },
        
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tenants.insert_one(tenant_data)
    print(f"Created default tenant with ID: {tenant_id}")
    return tenant_id

async def create_main_admin_user(db, tenant_id: str, existing_env_vars: Dict[str, Any]) -> str:
    """
    Create the main admin user using existing admin credentials
    Returns user_id
    """
    # Check if main admin already exists
    existing_user = await db.users.find_one({"tenant_id": tenant_id, "role": "main_admin"})
    if existing_user:
        print("Main admin user already exists")
        return existing_user["id"]
    
    user_id = str(uuid.uuid4())
    
    # Use existing admin credentials
    username = existing_env_vars.get("ADMIN_USERNAME", "admin")
    password_hash = existing_env_vars.get("ADMIN_PASSWORD_HASH")
    
    # If no password hash, create one for default password
    if not password_hash:
        password_hash = hashlib.sha256("admin123".encode()).hexdigest()
    
    user_data = {
        "id": user_id,
        "tenant_id": tenant_id,
        "email": existing_env_vars.get("SMTP_FROM_EMAIL", "admin@example.com"),
        "username": username,
        "password_hash": password_hash,
        "full_name": "Main Administrator",
        "role": UserRole.MAIN_ADMIN.value,
        "custom_permissions": [],
        "is_active": True,
        "last_login": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": None
    }
    
    await db.users.insert_one(user_data)
    print(f"Created main admin user with ID: {user_id}, username: {username}")
    return user_id

async def migrate_orders_to_tenant(db, tenant_id: str):
    """
    Add tenant_id to all existing orders
    """
    result = await db.orders.update_many(
        {"tenant_id": {"$exists": False}},
        {"$set": {"tenant_id": tenant_id, "notes": []}}
    )
    print(f"Migrated {result.modified_count} orders to tenant {tenant_id}")
    return result.modified_count

async def migrate_google_tokens_to_tenant(db, tenant_id: str):
    """
    Add tenant_id to all existing google_tokens
    """
    result = await db.google_tokens.update_many(
        {"tenant_id": {"$exists": False}},
        {"$set": {"tenant_id": tenant_id}}
    )
    print(f"Migrated {result.modified_count} google_tokens to tenant {tenant_id}")
    return result.modified_count

async def run_migration():
    """
    Main migration function to convert single-tenant to multi-tenant
    """
    print("=" * 60)
    print("Starting Multi-Tenant Migration")
    print("=" * 60)
    
    # Load environment variables
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).parent.parent / '.env')
    
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("\n📦 Collecting existing configuration...")
    existing_env_vars = {
        "SHOPIFY_SHOP_NAME": os.environ.get('SHOPIFY_SHOP_NAME'),
        "SHOPIFY_API_KEY": os.environ.get('SHOPIFY_API_KEY'),
        "SHOPIFY_API_SECRET": os.environ.get('SHOPIFY_API_SECRET'),
        "SHOPIFY_ACCESS_TOKEN": os.environ.get('SHOPIFY_ACCESS_TOKEN'),
        "GOOGLE_CLIENT_ID": os.environ.get('GOOGLE_CLIENT_ID'),
        "GOOGLE_CLIENT_SECRET": os.environ.get('GOOGLE_CLIENT_SECRET'),
        "SPREADSHEET_ID": os.environ.get('SPREADSHEET_ID'),
        "SMTP_HOST": os.environ.get('SMTP_HOST', 'smtp.gmail.com'),
        "SMTP_PORT": os.environ.get('SMTP_PORT', '587'),
        "SMTP_USER": os.environ.get('SMTP_USER'),
        "SMTP_PASSWORD": os.environ.get('SMTP_PASSWORD'),
        "SMTP_FROM_EMAIL": os.environ.get('SMTP_FROM_EMAIL'),
        "ADMIN_USERNAME": os.environ.get('ADMIN_USERNAME', 'admin'),
        "ADMIN_PASSWORD_HASH": os.environ.get('ADMIN_PASSWORD_HASH'),
    }
    
    print("\n🏢 Step 1: Creating default tenant (Tenant #1)...")
    tenant_id = await create_default_tenant(db, existing_env_vars)
    
    print("\n👤 Step 2: Creating main admin user...")
    user_id = await create_main_admin_user(db, tenant_id, existing_env_vars)
    
    print("\n📋 Step 3: Migrating existing orders...")
    orders_migrated = await migrate_orders_to_tenant(db, tenant_id)
    
    print("\n🔑 Step 4: Migrating Google tokens...")
    tokens_migrated = await migrate_google_tokens_to_tenant(db, tenant_id)
    
    print("\n" + "=" * 60)
    print("Migration Complete!")
    print("=" * 60)
    print(f"✅ Tenant ID: {tenant_id}")
    print(f"✅ Admin User ID: {user_id}")
    print(f"✅ Orders migrated: {orders_migrated}")
    print(f"✅ Tokens migrated: {tokens_migrated}")
    print("\n📝 Next steps:")
    print("   1. Update server.py to use new models and auth")
    print("   2. Test login with existing admin credentials")
    print("   3. Verify all orders are accessible")
    print("=" * 60)
    
    client.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_migration())
