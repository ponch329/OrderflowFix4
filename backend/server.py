from fastapi import FastAPI, APIRouter, HTTPException, Form, File, UploadFile
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
import os
import logging
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Bobblehead Proof Approval System - Multi-Tenant SaaS")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Import routes
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.orders import router as orders_router
from routes.settings import router as settings_router
from routes.vendors import router as vendors_router

# Include routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(orders_router)
api_router.include_router(settings_router)
api_router.include_router(vendors_router)

# Legacy admin routes (for backwards compatibility during transition)
import hashlib
import jwt
from datetime import datetime, timezone, timedelta
from models.user import User
from typing import List

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

@api_router.post("/admin/login")
async def admin_login_legacy(login_data: dict):
    """
    Legacy admin login endpoint for backwards compatibility
    Redirects to new auth system
    """
    from routes.auth import login
    from models.user import UserLogin
    user_login = UserLogin(username=login_data["username"], password=login_data["password"])
    return await login(user_login, db)

@api_router.get("/admin/orders")
async def get_admin_orders_legacy():
    """
    Legacy admin orders endpoint - returns all orders without pagination
    For backwards compatibility during transition
    """
    # Get first tenant
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    orders = await db.orders.find({"tenant_id": tenant_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        # Convert datetime strings to datetime objects
        for field in ['created_at', 'updated_at', 'clay_entered_at', 'paint_entered_at', 'fulfilled_at', 'canceled_at']:
            if field in order and isinstance(order[field], str):
                order[field] = datetime.fromisoformat(order[field])
    
    return orders

@api_router.get("/admin/orders/{order_id}")
async def get_admin_order_details(order_id: str):
    """
    Get single order details for admin
    Legacy endpoint without auth for backwards compatibility
    """
    # Get first tenant
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Convert datetime strings to datetime objects
    for field in ['created_at', 'updated_at', 'clay_entered_at', 'paint_entered_at', 'fulfilled_at', 'canceled_at']:
        if field in order and isinstance(order[field], str):
            order[field] = datetime.fromisoformat(order[field])
    
    return order

@api_router.patch("/admin/orders/{order_id}/info")
async def update_admin_order_info(order_id: str, update_data: dict):
    """
    Update order info for admin
    Legacy endpoint without auth
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if "order_number" in update_data:
        update_fields["order_number"] = update_data["order_number"]
    if "customer_name" in update_data:
        update_fields["customer_name"] = update_data["customer_name"]
    if "customer_email" in update_data:
        update_fields["customer_email"] = update_data["customer_email"]
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Order updated successfully"}

@api_router.patch("/admin/orders/{order_id}/tracking")
async def update_order_tracking_manual(
    order_id: str,
    tracking_data: dict
):
    """Manually update order tracking information"""
    from datetime import datetime, timezone
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_fields = {
        "tracking_number": tracking_data.get("tracking_number"),
        "tracking_url": tracking_data.get("tracking_url"),
        "tracking_company": tracking_data.get("tracking_company"),
        "shipment_status": tracking_data.get("shipment_status", "in_transit"),
        "shipped_at": tracking_data.get("shipped_at", datetime.now(timezone.utc).isoformat()),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": update_fields}
    )
    
    return {"success": True, "message": "Tracking information updated"}

@api_router.patch("/admin/orders/{order_id}/status")
async def update_admin_order_status(order_id: str, update_data: dict):
    """
    Update order stage/status for admin
    Legacy endpoint without auth
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc)
    update_fields = {
        "updated_at": now.isoformat()
    }
    
    if "stage" in update_data:
        stage = update_data["stage"]
        update_fields["stage"] = stage
        
        if stage == "archived":
            update_fields["is_archived"] = True
        else:
            update_fields["is_archived"] = False
            
        if stage == "clay":
            update_fields["clay_entered_at"] = now.isoformat()
        elif stage == "paint":
            update_fields["paint_entered_at"] = now.isoformat()
        elif stage == "fulfilled" or stage == "shipped":
            update_fields["fulfilled_at"] = now.isoformat()
            
            # Fetch tracking information from Shopify when order ships
            if order.get("shopify_order_id"):
                from utils.tracking import update_order_tracking
                try:
                    await update_order_tracking(
                        order_id,
                        order["shopify_order_id"],
                        db,
                        tenant
                    )
                except Exception as e:
                    import logging
                    logging.error(f"Failed to fetch tracking for order {order_id}: {e}")
        elif stage == "canceled":
            update_fields["canceled_at"] = now.isoformat()
    
    if "clay_status" in update_data:
        update_fields["clay_status"] = update_data["clay_status"]
    
    if "paint_status" in update_data:
        update_fields["paint_status"] = update_data["paint_status"]
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Status updated successfully"}

@api_router.post("/admin/orders/{order_id}/request-changes")
async def admin_request_changes_legacy(
    order_id: str,
    message: str = Form(...),
    stage: str = Form(...),
    files: List[UploadFile] = File(None)
):
    """
    Admin requests changes on an order
    Legacy endpoint without auth
    """
    from typing import List
    import base64
    
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Handle reference images
    additional_images = []
    if files:
        for file in files:
            content = await file.read()
            image_base64 = base64.b64encode(content).decode('utf-8')
            additional_images.append(f"data:image/jpeg;base64,{image_base64}")
    
    # Create approval request
    approval = {
        "id": str(__import__('uuid').uuid4()),
        "status": "changes_requested",
        "message": message,
        "images": additional_images,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update order status
    field = f"{stage}_approval"
    status_field = f"{stage}_status"
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {
            "$set": {
                field: approval,
                status_field: "changes_requested",
                "last_updated_by": "admin",
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Log to sheets
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        tenant_id,
        order['order_number'],
        f"Changes Requested - {stage.capitalize()}",
        message,
        stage=order.get('stage', ''),
        status="changes_requested",
        emailed_customer="No"
    )
    
    return {"message": "Changes requested successfully", "approval": approval}

@api_router.post("/admin/orders/{order_id}/proofs")
async def admin_upload_proofs_legacy(
    order_id: str,
    stage: str = Form(...),
    revision_note: str = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Upload proofs from admin order details page
    Legacy endpoint without auth
    """
    import base64
    import zipfile
    import io
    
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Determine the current round number
    existing_proofs = order.get(f"{stage}_proofs", [])
    current_round = 1
    if existing_proofs:
        current_round = max([p.get('round', 1) for p in existing_proofs]) + 1
    
    uploaded_proofs = []
    
    for file in files:
        if file.filename.endswith('.zip'):
            # Handle zip file
            content = await file.read()
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                        image_data = zf.read(name)
                        image_base64 = base64.b64encode(image_data).decode('utf-8')
                        proof = {
                            "id": str(__import__('uuid').uuid4()),
                            "url": f"data:image/jpeg;base64,{image_base64}",
                            "filename": name,
                            "uploaded_at": datetime.now(timezone.utc).isoformat(),
                            "round": current_round,
                            "revision_note": revision_note
                        }
                        uploaded_proofs.append(proof)
        else:
            # Handle individual image file
            content = await file.read()
            image_base64 = base64.b64encode(content).decode('utf-8')
            proof = {
                "id": str(__import__('uuid').uuid4()),
                "url": f"data:image/jpeg;base64,{image_base64}",
                "filename": file.filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "round": current_round,
                "revision_note": revision_note
            }
            uploaded_proofs.append(proof)
    
    # Update order with proofs and change status to feedback_needed
    field = f"{stage}_proofs"
    status_field = f"{stage}_status"
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {
            "$push": {field: {"$each": uploaded_proofs}},
            "$set": {
                status_field: "feedback_needed",
                "last_updated_by": "admin",
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Send automated email notification to customer
    emailed_customer = "No"
    if order.get('customer_email'):
        from utils.helpers import send_customer_proof_notification
        email_sent = await send_customer_proof_notification(
            db,
            tenant_id,
            order,
            stage,
            len(uploaded_proofs)
        )
        emailed_customer = "Yes" if email_sent else "No"
    
    # Log to sheets with email status
    from utils.helpers import log_to_sheets
    note_text = f" - {revision_note}" if revision_note else ""
    await log_to_sheets(
        db,
        tenant_id,
        order['order_number'],
        f"Proofs Uploaded - {stage.capitalize()} (Round {current_round})",
        f"{len(uploaded_proofs)} images{note_text}",
        stage=order.get('stage', ''),
        status='feedback_needed',
        emailed_customer=emailed_customer
    )
    
    return {
        "message": f"Uploaded {len(uploaded_proofs)} proofs (Round {current_round})",
        "proofs": uploaded_proofs,
        "round": current_round
    }

# Analytics endpoint
@api_router.get("/admin/analytics")
async def get_analytics(days: int = 7, compare_days: int = 7):
    """Get dashboard analytics - shows current state of all orders with comparison"""
    from datetime import timedelta
    from middleware.auth import get_current_user
    
    # For now, get the first tenant (will be enhanced with proper auth)
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=days)
    compare_start = current_start - timedelta(days=compare_days)
    compare_end = current_start
    
    # Get ALL orders for current state metrics
    all_orders = await db.orders.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(1000)
    
    # Get orders created in current period for comparison
    current_period_orders = await db.orders.find({
        "tenant_id": tenant_id,
        "created_at": {"$gte": current_start.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    # Get orders created in comparison period
    compare_period_orders = await db.orders.find({
        "tenant_id": tenant_id,
        "created_at": {
            "$gte": compare_start.isoformat(),
            "$lt": compare_end.isoformat()
        }
    }, {"_id": 0}).to_list(1000)
    
    # Calculate CURRENT STATE metrics (all orders)
    current_metrics = {
        "total": len(all_orders),
        "by_stage": {},
        "by_status": {}
    }
    
    for order in all_orders:
        stage = order.get("stage", "unknown")
        current_metrics["by_stage"][stage] = current_metrics["by_stage"].get(stage, 0) + 1
        
        clay_status = order.get("clay_status", "unknown")
        paint_status = order.get("paint_status", "unknown")
        current_metrics["by_status"][clay_status] = current_metrics["by_status"].get(clay_status, 0) + 1
        current_metrics["by_status"][paint_status] = current_metrics["by_status"].get(paint_status, 0) + 1
    
    # Calculate metrics for orders CREATED in current period (for comparison)
    current_period_count = len(current_period_orders)
    
    # Calculate metrics for orders CREATED in comparison period
    compare_period_count = len(compare_period_orders)
    
    return {
        "current_state": {
            "description": "Current state of all orders",
            "metrics": current_metrics
        },
        "current_period": {
            "days": days,
            "orders_created": current_period_count,
            "description": f"Orders created in last {days} days"
        },
        "compare_period": {
            "days": compare_days,
            "orders_created": compare_period_count,
            "description": f"Orders created in previous {compare_days} days"
        }
    }

# Shopify sync endpoint
@api_router.post("/admin/sync-orders")
async def sync_orders():
    """Sync orders from Shopify with Item Vendor information and auto-split multi-vendor orders"""
    import shopify
    from utils.order_splitting import split_order_by_vendor, should_split_order
    
    # Get first tenant for now (will be enhanced with proper auth)
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    # Get Shopify config from tenant
    shopify_shop_name = tenant.get("shopify_shop_name")
    shopify_access_token = tenant.get("shopify_access_token")
    
    if not shopify_shop_name or not shopify_access_token:
        raise HTTPException(status_code=400, detail="Shopify not configured for this tenant")
    
    # Initialize Shopify session
    shopify_api_version = "2024-10"
    session = shopify.Session(f"{shopify_shop_name}.myshopify.com", shopify_api_version, shopify_access_token)
    shopify.ShopifyResource.activate_session(session)
    
    try:
        orders = shopify.Order.find(status='any', limit=250)
        synced_count = 0
        split_count = 0
        
        for order in orders:
            existing = await db.orders.find_one({
                "tenant_id": tenant_id,
                "shopify_order_id": str(order.id)
            })
            
            if not existing:
                # Use Shopify's created_at date
                shopify_created_at = order.created_at if hasattr(order, 'created_at') else datetime.now(timezone.utc)
                
                # Prepend "20" to order number
                order_number = f"20{order.order_number}"
                
                # Get fulfillment status
                fulfillment_status = order.fulfillment_status if hasattr(order, 'fulfillment_status') else None
                
                # Extract line items with vendor information
                line_items = []
                item_vendor = None
                if hasattr(order, 'line_items') and order.line_items:
                    for item in order.line_items:
                        line_item = {
                            "id": str(item.id) if hasattr(item, 'id') else None,
                            "title": item.title if hasattr(item, 'title') else "",
                            "quantity": item.quantity if hasattr(item, 'quantity') else 1,
                            "vendor": item.vendor if hasattr(item, 'vendor') else "Unknown",
                            "sku": item.sku if hasattr(item, 'sku') else ""
                        }
                        line_items.append(line_item)
                    
                    # Get vendor from first line item for main order
                    first_item = order.line_items[0]
                    if hasattr(first_item, 'vendor'):
                        item_vendor = first_item.vendor
                
                order_doc = {
                    "id": str(__import__('uuid').uuid4()),
                    "tenant_id": tenant_id,
                    "shopify_order_id": str(order.id),
                    "order_number": order_number,
                    "customer_email": order.customer.email if order.customer else "",
                    "customer_name": f"{order.customer.first_name} {order.customer.last_name}" if order.customer else "",
                    "item_vendor": item_vendor,
                    "parent_order_id": None,
                    "line_items": line_items,
                    "stage": "fulfilled" if fulfillment_status == "fulfilled" else "clay",
                    "clay_status": "sculpting",
                    "paint_status": "pending",
                    "is_manual_order": False,
                    "is_archived": False,
                    "shopify_fulfillment_status": fulfillment_status,
                    "clay_entered_at": shopify_created_at.isoformat() if hasattr(shopify_created_at, 'isoformat') else shopify_created_at,
                    "paint_entered_at": None,
                    "fulfilled_at": None,
                    "canceled_at": None,
                    "clay_proofs": [],
                    "paint_proofs": [],
                    "clay_approval": None,
                    "paint_approval": None,
                    "notes": [],
                    "last_updated_by": "system",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "created_at": shopify_created_at.isoformat() if hasattr(shopify_created_at, 'isoformat') else shopify_created_at,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.orders.insert_one(order_doc)
                synced_count += 1
                
                # Check if order should be split by vendor
                if await should_split_order(line_items):
                    sub_order_ids = await split_order_by_vendor(db, order_doc, line_items)
                    split_count += len(sub_order_ids)
            else:
                # Update existing order's fulfillment status if changed
                fulfillment_status = order.fulfillment_status if hasattr(order, 'fulfillment_status') else None
                if fulfillment_status != existing.get('shopify_fulfillment_status'):
                    update_data = {
                        "shopify_fulfillment_status": fulfillment_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    # If fulfilled in Shopify and not already in fulfilled/canceled stage, update stage
                    if fulfillment_status == "fulfilled" and existing.get('stage') not in ['fulfilled', 'canceled']:
                        update_data["stage"] = "fulfilled"
                    
                    await db.orders.update_one(
                        {"tenant_id": tenant_id, "shopify_order_id": str(order.id)},
                        {"$set": update_data}
                    )
        
        return {
            "message": f"Synced {synced_count} new orders, split {split_count} sub-orders",
            "total": len(orders),
            "synced": synced_count,
            "split": split_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Customer routes (public - no auth required)
@api_router.get("/customer/lookup")
async def lookup_order(email: str, order_number: str):
    """Customer lookup by email and order number"""
    # Find order across all tenants
    order = await db.orders.find_one(
        {"customer_email": email.lower(), "order_number": order_number},
        {"_id": 0}
    )
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    for field in ['created_at', 'updated_at']:
        if isinstance(order.get(field), str):
            order[field] = datetime.fromisoformat(order[field])
    
    return order

@api_router.post("/customer/orders/{order_id}/approve")
async def approve_stage(
    order_id: str,
    stage: str,
    status: str = Form(...),
    message: str = Form(None),
    files: List[UploadFile] = File(None)
):
    """Customer approves or requests changes for a stage"""
    import base64
    from utils.workflow import get_workflow_engine
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get tenant settings for workflow configuration
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) if tenant_id else None
    
    # Initialize workflow engine
    workflow_engine = get_workflow_engine(tenant.get("settings", {}) if tenant else {})
    
    # Handle additional images if provided
    additional_images = []
    if files:
        for file in files:
            content = await file.read()
            image_base64 = base64.b64encode(content).decode('utf-8')
            additional_images.append(f"data:image/jpeg;base64,{image_base64}")
    
    approval = {
        "id": str(__import__('uuid').uuid4()),
        "status": status,
        "message": message,
        "images": additional_images,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Use workflow engine to calculate stage transitions
    workflow_updates = workflow_engine.calculate_stage_transition(
        current_stage=stage,
        approval_status=status
    )
    
    # Build update data
    field = f"{stage}_approval"
    update_data = {
        field: approval,
        **workflow_updates,  # Apply workflow-calculated updates
        "last_updated_by": "customer",
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Send email notification and log to sheets
    from utils.helpers import log_to_sheets
    from email_templates import get_approval_email, get_changes_requested_email
    
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    
    if tenant:
        logo_url = tenant.get("settings", {}).get("logo_url")
        
        # Send email
        if status == "approved":
            from email_templates import get_approval_email
            subject, html_content = get_approval_email(
                order['order_number'],
                order['customer_name'],
                order['customer_email'],
                stage,
                logo_url=logo_url
            )
        else:
            from email_templates import get_changes_requested_email
            subject, html_content = get_changes_requested_email(
                order['order_number'],
                order['customer_name'],
                order['customer_email'],
                stage,
                message,
                len(additional_images),
                logo_url=logo_url
            )
        
        try:
            from utils.helpers import send_email
            await send_email(tenant, tenant.get("smtp_from_email", ""), subject, html_content)
        except Exception as e:
            logging.warning(f"Email send failed: {e}")
        
        # Log to sheets
        action = "Approved" if status == "approved" else "Changes Requested"
        details = f"{stage.capitalize()} - {message or 'No message'}" if status != "approved" else f"{stage.capitalize()}"
        await log_to_sheets(
            db,
            tenant_id,
            order['order_number'],
            action,
            details,
            stage=order.get('stage', ''),
            status=order.get(f"{stage}_status", ''),
            emailed_customer="No"  # Customer action, not emailing them
        )
    
    return {"message": "Response recorded", "approval": approval}

@api_router.post("/admin/orders/{order_id}/ping-customer")
async def ping_customer(order_id: str, stage: str):
    """Send reminder email to customer to review proofs"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if proofs exist for this stage
    proofs = order.get(f"{stage}_proofs", [])
    if not proofs:
        raise HTTPException(status_code=400, detail=f"No {stage} proofs uploaded yet")
    
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not found")
    
    # Send reminder email
    subject = f"Reminder: Please Review Order #{order['order_number']} - {stage.capitalize()} Proofs"
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2196F3;">🔔 Proof Review Reminder</h2>
        <p>Hi {order['customer_name']},</p>
        <p>This is a friendly reminder that your bobblehead proofs are ready for review!</p>
        
        <div style="background: #f0f8ff; padding: 20px; border-left: 4px solid #2196F3; margin: 20px 0;">
            <p><strong>Order Number:</strong> #{order['order_number']}</p>
            <p><strong>Stage:</strong> {stage.capitalize()}</p>
            <p><strong>Proofs Available:</strong> {len(proofs)} image(s)</p>
        </div>
        
        <p>Please review your proofs and let us know if you'd like to:</p>
        <ul>
            <li>✓ Approve the {stage} stage</li>
            <li>📝 Request any changes</li>
        </ul>
        
        <p style="text-align: center; margin: 30px 0;">
            <a href="https://proofs.allbobbleheads.com/customer" 
               style="background: #2196F3; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Review Your Proofs
            </a>
        </p>
        
        <p style="color: #666; font-size: 14px;">To view your order, visit the customer portal and enter your email and order number.</p>
        
        <p>Thank you!</p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
            {tenant.get('name', 'AllBobbleheads.com')} | {tenant.get('smtp_from_email', 'orders@allbobbleheads.com')}
        </p>
    </body>
    </html>
    """
    
    try:
        from utils.helpers import send_email, log_to_sheets
        await send_email(tenant, order['customer_email'], subject, html_content)
        await log_to_sheets(
            db,
            tenant_id,
            order['order_number'],
            "Customer Pinged",
            f"{stage.capitalize()} - Reminder sent",
            stage=order.get('stage', ''),
            status=order.get(f"{stage}_status", ''),
            emailed_customer="Yes"
        )
        return {"message": "Reminder email sent successfully"}
    except Exception as e:
        logging.error(f"Failed to send reminder email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send reminder email")

# Google Sheets OAuth routes
@api_router.get("/oauth/sheets/login")
async def sheets_login():
    """Initialize Google Sheets OAuth"""
    from google_auth_oauthlib.flow import Flow
    
    # Get first tenant
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    google_client_id = tenant.get("google_client_id")
    google_client_secret = tenant.get("google_client_secret")
    
    if not google_client_id or not google_client_secret:
        raise HTTPException(status_code=400, detail="Google Sheets not configured")
    
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ]
    
    sheets_redirect_uri = os.environ.get('SHEETS_REDIRECT_URI', '')
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": google_client_id,
            "client_secret": google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=SCOPES, redirect_uri=sheets_redirect_uri)
    
    url, state = flow.authorization_url(access_type='offline', prompt='consent')
    
    # Save state temporarily
    await db.oauth_states.insert_one({
        "state": state,
        "tenant_id": tenant["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc).timestamp() + 600)
    })
    
    return RedirectResponse(url)

@api_router.get("/oauth/sheets/callback")
async def sheets_callback(code: str, state: str):
    """Handle Google Sheets OAuth callback"""
    import warnings
    from google_auth_oauthlib.flow import Flow
    
    # Verify state
    saved_state = await db.oauth_states.find_one({"state": state})
    if not saved_state:
        raise HTTPException(status_code=400, detail="Invalid state")
    
    tenant_id = saved_state.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=500, detail="Tenant not found")
    
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ]
    
    sheets_redirect_uri = os.environ.get('SHEETS_REDIRECT_URI', '')
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": tenant["google_client_id"],
            "client_secret": tenant["google_client_secret"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=SCOPES, redirect_uri=sheets_redirect_uri)
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        flow.fetch_token(code=code)
    
    creds = flow.credentials
    
    # Verify scopes
    required_scopes = {"https://www.googleapis.com/auth/spreadsheets"}
    granted_scopes = set(creds.scopes or [])
    if not required_scopes.issubset(granted_scopes):
        missing = required_scopes - granted_scopes
        raise HTTPException(status_code=400, detail=f"Missing scopes: {', '.join(missing)}")
    
    # Save tokens
    token_doc = {
        "type": "admin",
        "tenant_id": tenant_id,
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expires_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.google_tokens.update_one(
        {"type": "admin", "tenant_id": tenant_id},
        {"$set": token_doc},
        upsert=True
    )
    
    # Clean up state
    await db.oauth_states.delete_one({"state": state})
    
    return RedirectResponse("/admin")

# Root route
@api_router.get("/")
async def root():
    return {"message": "Bobblehead Order Approval System API - Multi-Tenant SaaS", "version": "2.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
