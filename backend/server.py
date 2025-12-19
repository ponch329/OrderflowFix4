from fastapi import FastAPI, APIRouter, HTTPException, Form, File, UploadFile
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
import os
import re
import logging
from pathlib import Path

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection with error handling
try:
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    if not mongo_url:
        logger.error("MONGO_URL environment variable is not set")
        raise ValueError("MONGO_URL environment variable is not set")
    if not db_name:
        logger.error("DB_NAME environment variable is not set")
        raise ValueError("DB_NAME environment variable is not set")
    
    logger.info(f"Initializing MongoDB connection to database: {db_name}")
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    logger.info(f"✅ MongoDB client initialized for database: {db_name}")
except Exception as e:
    logger.error(f"❌ Failed to initialize MongoDB connection: {str(e)}")
    raise

# Create the main app without a prefix
app = FastAPI(title="Bobblehead Proof Approval System - Multi-Tenant SaaS")

@app.on_event("startup")
async def startup_event():
    """Log application startup"""
    import asyncio
    
    logger.info("=" * 50)
    logger.info("Application starting up...")
    logger.info(f"MongoDB URL configured: {mongo_url[:20]}..." if mongo_url else "No MongoDB URL")
    logger.info(f"Database name: {db_name}")
    logger.info(f"CORS Origins: {os.environ.get('CORS_ORIGINS', '*')}")
    logger.info("=" * 50)
    
    # Test MongoDB connection
    try:
        await db.command("ping")
        logger.info("✅ MongoDB connection successful")
    except Exception as e:
        logger.error(f"❌ MongoDB connection failed: {str(e)}")
        raise
    
    # Start workflow scheduler as background task
    try:
        from utils.workflow_scheduler import start_scheduler_loop
        asyncio.create_task(start_scheduler_loop(interval_minutes=5))
        logger.info("✅ Workflow scheduler started (runs every 5 minutes)")
    except Exception as e:
        logger.warning(f"⚠️ Could not start workflow scheduler: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown"""
    logger.info("Application shutting down...")
    client.close()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Import routes
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.orders import router as orders_router
from routes.settings import router as settings_router
from routes.vendors import router as vendors_router
from routes.workflow import router as workflow_router

# Include routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(orders_router)
api_router.include_router(settings_router)
api_router.include_router(vendors_router)
api_router.include_router(workflow_router)

# Legacy admin routes (for backwards compatibility during transition)
import hashlib
import jwt
from datetime import datetime, timezone, timedelta
from models.user import User

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# ============== WORKFLOW CONFIG HELPERS ==============
# These functions get stage/status configuration from the database

async def get_workflow_config_from_db():
    """
    Get workflow configuration from database - single source of truth.
    Returns default config if none exists in DB.
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        return get_default_workflow_config()
    
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    
    if not workflow_config.get("stages"):
        return get_default_workflow_config()
    
    return workflow_config

def get_default_workflow_config():
    """
    Default workflow configuration - used only when no DB config exists.
    """
    return {
        "stages": [
            {"id": "clay", "name": "Clay", "order": 1, "statuses": [
                {"id": "sculpting", "name": "In Progress"},
                {"id": "feedback_needed", "name": "Feedback Needed"},
                {"id": "changes_requested", "name": "Changes Requested"},
                {"id": "approved", "name": "Approved"}
            ]},
            {"id": "paint", "name": "Paint", "order": 2, "statuses": [
                {"id": "painting", "name": "In Progress"},
                {"id": "feedback_needed", "name": "Feedback Needed"},
                {"id": "changes_requested", "name": "Changes Requested"},
                {"id": "approved", "name": "Approved"}
            ]},
            {"id": "shipped", "name": "Shipped", "order": 3, "statuses": [
                {"id": "in_transit", "name": "In Transit"},
                {"id": "delivered", "name": "Delivered"}
            ]},
            {"id": "archived", "name": "Archived", "order": 4, "statuses": [
                {"id": "completed", "name": "Completed"},
                {"id": "canceled", "name": "Canceled"}
            ]}
        ],
        "rules": [],
        "timers": []
    }

def get_first_stage(workflow_config):
    """Get the first active stage ID from workflow config."""
    stages = workflow_config.get("stages", [])
    for stage in stages:
        if stage.get("id") not in ["archived", "shipped"]:
            return stage.get("id", "clay")
    return "clay"

def get_first_status_for_stage(workflow_config, stage_id):
    """Get the first status ID for a given stage."""
    stages = workflow_config.get("stages", [])
    for stage in stages:
        if stage.get("id") == stage_id:
            statuses = stage.get("statuses", [])
            if statuses:
                return statuses[0].get("id", "pending")
    return "pending"

def get_all_valid_stages(workflow_config):
    """Get list of all valid stage IDs."""
    stages = workflow_config.get("stages", [])
    return [s.get("id") for s in stages if s.get("id")]

def get_all_valid_statuses_for_stage(workflow_config, stage_id):
    """Get list of all valid status IDs for a stage."""
    stages = workflow_config.get("stages", [])
    for stage in stages:
        if stage.get("id") == stage_id:
            return [st.get("id") for st in stage.get("statuses", []) if st.get("id")]
    return []

# ============== END WORKFLOW CONFIG HELPERS ==============

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
async def get_admin_orders_legacy(
    page: int = 1,
    limit: int = 40,
    stage: str = None,
    status: str = None,
    archived: bool = None,
    search: str = None
):
    """
    Admin orders endpoint with server-side pagination
    Returns paginated orders for better performance
    """
    # Get first tenant
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    # Build query filter
    query = {"tenant_id": tenant_id}
    
    # Filter by archived status - check BOTH 'archived' and 'is_archived' fields for compatibility
    if archived is True:
        # Show only archived orders (check both field names)
        query["$or"] = [{"archived": True}, {"is_archived": True}]
    elif archived is False:
        # Show non-archived orders - exclude orders where archived=True OR is_archived=True
        query["$and"] = [
            {"$or": [{"archived": False}, {"archived": {"$exists": False}}, {"archived": None}]},
            {"$or": [{"is_archived": False}, {"is_archived": {"$exists": False}}, {"is_archived": None}]}
        ]
    # If archived is None, show all orders (no filter)
    
    # Filter by stage
    if stage:
        query["stage"] = stage
    
    # Filter by status (stage-specific status)
    if status and stage:
        # Handle backward compatibility: "painting" and "sculpting" are both "in progress" states
        # Some older orders may have "sculpting" for paint stage instead of "painting"
        if stage == "paint" and status == "painting":
            query[f"{stage}_status"] = {"$in": ["painting", "sculpting"]}
        else:
            query[f"{stage}_status"] = status
    
    # Search filter - need to handle $and/$or conflict
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        search_conditions = [
            {"order_number": search_regex},
            {"customer_email": search_regex},
            {"customer_name": search_regex}
        ]
        # Add search to existing $and or create new one
        if "$and" in query:
            query["$and"].append({"$or": search_conditions})
        else:
            query["$or"] = search_conditions
    
    # Get total count for pagination
    total_count = await db.orders.count_documents(query)
    total_pages = (total_count + limit - 1) // limit  # Ceiling division
    
    # Calculate skip for pagination
    skip = (page - 1) * limit
    
    # Fetch paginated orders
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for order in orders:
        # Convert datetime strings to datetime objects
        for field in ['created_at', 'updated_at', 'clay_entered_at', 'paint_entered_at', 'fulfilled_at', 'canceled_at']:
            if field in order and isinstance(order[field], str):
                order[field] = datetime.fromisoformat(order[field])
    
    return {
        "orders": orders,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }

@api_router.get("/admin/orders/counts")
async def get_orders_counts():
    """
    Get order counts by stage/status for sidebar - dynamically based on workflow config
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    tenant_id = tenant["id"]
    
    # Get workflow stages from config
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    stages = workflow_config.get("stages", [
        {"id": "clay", "statuses": [{"id": "sculpting"}, {"id": "feedback_needed"}, {"id": "changes_requested"}, {"id": "approved"}]},
        {"id": "paint", "statuses": [{"id": "painting"}, {"id": "feedback_needed"}, {"id": "changes_requested"}, {"id": "approved"}]},
        {"id": "shipped", "statuses": [{"id": "in_transit"}, {"id": "delivered"}]},
    ])
    
    # Non-archived filter - check both 'archived' and 'is_archived' fields
    non_archived_filter = {
        "$and": [
            {"$or": [{"archived": False}, {"archived": {"$exists": False}}, {"archived": None}]},
            {"$or": [{"is_archived": False}, {"is_archived": {"$exists": False}}, {"is_archived": None}]}
        ]
    }
    
    # Archived filter - check both fields
    archived_filter = {"$or": [{"archived": True}, {"is_archived": True}]}
    
    # Build dynamic aggregation pipeline
    facet_stages = {
        "total": [{"$count": "count"}],
        "archived": [
            {"$match": archived_filter},
            {"$count": "count"}
        ],
        "by_stage": [
            {"$match": non_archived_filter},
            {"$group": {"_id": "$stage", "count": {"$sum": 1}}}
        ]
    }
    
    # Add dynamic status counts for each stage
    for stage in stages:
        stage_id = stage.get("id", "")
        if stage_id and stage_id != "archived":
            status_field = f"{stage_id}_status"
            facet_stages[f"{stage_id}_by_status"] = [
                {"$match": {"stage": stage_id, **non_archived_filter}},
                {"$group": {"_id": f"${status_field}", "count": {"$sum": 1}}}
            ]
    
    pipeline = [
        {"$match": {"tenant_id": tenant_id}},
        {"$facet": facet_stages}
    ]
    
    result = await db.orders.aggregate(pipeline).to_list(1)
    
    if not result:
        return {"total": 0, "archived": 0, "by_stage": {}, "status_counts": {}}
    
    data = result[0]
    
    # Build status counts object dynamically
    status_counts = {}
    for stage in stages:
        stage_id = stage.get("id", "")
        if stage_id and stage_id != "archived":
            key = f"{stage_id}_by_status"
            if key in data:
                stage_counts = {item["_id"]: item["count"] for item in data[key] if item["_id"]}
                
                # For paint stage: combine "sculpting" counts into "painting" for backward compatibility
                # Some older orders may have "sculpting" status instead of "painting"
                if stage_id == "paint" and "sculpting" in stage_counts:
                    painting_count = stage_counts.get("painting", 0) + stage_counts.get("sculpting", 0)
                    stage_counts["painting"] = painting_count
                    del stage_counts["sculpting"]  # Remove sculpting from display
                
                status_counts[stage_id] = stage_counts
    
    return {
        "total": data["total"][0]["count"] if data["total"] else 0,
        "archived": data["archived"][0]["count"] if data["archived"] else 0,
        "by_stage": {item["_id"]: item["count"] for item in data["by_stage"] if item["_id"]},
        "status_counts": status_counts
    }

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

@api_router.post("/admin/orders/{order_id}/fetch-tracking")
async def fetch_tracking_from_shopify(order_id: str):
    """Fetch tracking information from Shopify for this order"""
    from utils.tracking import update_order_tracking
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.get("shopify_order_id"):
        raise HTTPException(status_code=400, detail="Order does not have a Shopify order ID")
    
    # Get tenant settings
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) if tenant_id else None
    
    if not tenant:
        raise HTTPException(status_code=400, detail="Tenant not found")
    
    # Fetch tracking from Shopify
    try:
        success = await update_order_tracking(
            order_id,
            order["shopify_order_id"],
            db,
            tenant.get("settings", {})
        )
        
        if success:
            # Return updated order
            updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
            return {
                "success": True,
                "message": "Tracking fetched from Shopify",
                "tracking": {
                    "tracking_number": updated_order.get("tracking_number"),
                    "tracking_url": updated_order.get("tracking_url"),
                    "tracking_company": updated_order.get("tracking_company"),
                    "shipment_status": updated_order.get("shipment_status")
                }
            }
        else:
            raise HTTPException(status_code=404, detail="No tracking information found in Shopify")
    except Exception as e:
        import logging
        logging.error(f"Failed to fetch tracking from Shopify: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tracking: {str(e)}")

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
    
    # Sync to Shopify if configured
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) if tenant_id else None
    
    if tenant and order.get("shopify_order_id"):
        try:
            await sync_tracking_to_shopify(
                order["shopify_order_id"],
                tracking_data.get("tracking_number"),
                tracking_data.get("tracking_company"),
                tracking_data.get("tracking_url"),
                tenant.get("settings", {})
            )
        except Exception as e:
            import logging
            logging.warning(f"Failed to sync tracking to Shopify: {e}")
    
    return {"success": True, "message": "Tracking information updated"}

async def sync_tracking_to_shopify(shopify_order_id: str, tracking_number: str, carrier: str, tracking_url: str, tenant_settings: dict):
    """Sync tracking information back to Shopify"""
    try:
        import shopify
        
        shopify_shop_name = tenant_settings.get("shopify_shop_name")
        shopify_access_token = tenant_settings.get("shopify_access_token")
        
        if not shopify_shop_name or not shopify_access_token:
            return
        
        # Initialize Shopify session
        shopify_api_version = "2024-10"
        session = shopify.Session(
            f"{shopify_shop_name}.myshopify.com",
            shopify_api_version,
            shopify_access_token
        )
        shopify.ShopifyResource.activate_session(session)
        
        # Get the order
        shopify_order = shopify.Order.find(shopify_order_id)
        
        if shopify_order and hasattr(shopify_order, 'fulfillments') and shopify_order.fulfillments:
            # Update the most recent fulfillment with tracking
            fulfillment = shopify_order.fulfillments[-1]
            fulfillment.tracking_number = tracking_number
            fulfillment.tracking_company = carrier
            if tracking_url:
                fulfillment.tracking_url = tracking_url
            fulfillment.save()
        
        shopify.ShopifyResource.clear_session()
    except Exception as e:
        import logging
        logging.error(f"Failed to sync tracking to Shopify: {e}")
        raise

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
            # Set initial clay status if not already set
            if not order.get("clay_status") or order.get("clay_status") == "pending":
                update_fields["clay_status"] = "sculpting"
        elif stage == "paint":
            update_fields["paint_entered_at"] = now.isoformat()
            # Set initial paint status to "painting" when entering paint stage
            if not order.get("paint_status") or order.get("paint_status") == "pending":
                update_fields["paint_status"] = "painting"
        elif stage == "fulfilled" or stage == "shipped":
            update_fields["fulfilled_at"] = now.isoformat()
            
            # Fetch tracking information from Shopify when order ships (non-blocking)
            # This is done asynchronously and won't slow down the response
            if order.get("shopify_order_id"):
                from utils.tracking import update_order_tracking
                import asyncio
                try:
                    # Use asyncio.create_task for non-blocking execution
                    # If it fails, we just log the error and continue
                    asyncio.create_task(update_order_tracking(
                        order_id,
                        order["shopify_order_id"],
                        db,
                        tenant
                    ))
                except Exception as e:
                    import logging
                    logging.warning(f"Could not schedule tracking fetch for order {order_id}: {e}")
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
    import uuid
    
    logger.info(f"=== PROOF UPLOAD START === order_id={order_id}, stage={stage}, files_count={len(files)}")
    
    try:
        # Step 1: Fetch tenant
        logger.info("Step 1: Fetching tenant...")
        tenant = await db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            logger.error("Step 1 FAILED: No tenant found")
            raise HTTPException(status_code=500, detail="No tenant found")
        
        tenant_id = tenant["id"]
        logger.info(f"Step 1 SUCCESS: tenant_id={tenant_id}")
        
        # Step 2: Fetch order
        logger.info(f"Step 2: Fetching order {order_id}...")
        order = await db.orders.find_one({
            "id": order_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not order:
            logger.error(f"Step 2 FAILED: Order {order_id} not found")
            raise HTTPException(status_code=404, detail="Order not found")
        logger.info(f"Step 2 SUCCESS: Found order {order.get('order_number', 'N/A')}")
        
        # Step 3: Determine round number
        logger.info("Step 3: Determining round number...")
        existing_proofs = order.get(f"{stage}_proofs", [])
        current_round = 1
        if existing_proofs:
            # Safe handling of round values
            rounds = []
            for p in existing_proofs:
                r = p.get('round', 1)
                if isinstance(r, (int, float)):
                    rounds.append(int(r))
                else:
                    rounds.append(1)
            current_round = max(rounds) + 1 if rounds else 1
        logger.info(f"Step 3 SUCCESS: current_round={current_round}")
        
        # Step 4: Process uploaded files
        logger.info(f"Step 4: Processing {len(files)} file(s)...")
        uploaded_proofs = []
        
        for idx, file in enumerate(files):
            try:
                logger.info(f"Step 4.{idx}: Processing file '{file.filename}'...")
                if file.filename and file.filename.lower().endswith('.zip'):
                    # Handle zip file
                    logger.info(f"Step 4.{idx}: File is a ZIP, extracting...")
                    content = await file.read()
                    with zipfile.ZipFile(io.BytesIO(content)) as zf:
                        for name in zf.namelist():
                            if name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
                                image_data = zf.read(name)
                                image_base64 = base64.b64encode(image_data).decode('utf-8')
                                proof = {
                                    "id": str(uuid.uuid4()),
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "filename": name,
                                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                                    "round": current_round,
                                    "revision_note": revision_note
                                }
                                uploaded_proofs.append(proof)
                    logger.info(f"Step 4.{idx}: ZIP processed, extracted {len(uploaded_proofs)} images")
                else:
                    # Handle individual image file
                    content = await file.read()
                    image_base64 = base64.b64encode(content).decode('utf-8')
                    proof = {
                        "id": str(uuid.uuid4()),
                        "url": f"data:image/jpeg;base64,{image_base64}",
                        "filename": file.filename or f"proof_{idx}.jpg",
                        "uploaded_at": datetime.now(timezone.utc).isoformat(),
                        "round": current_round,
                        "revision_note": revision_note
                    }
                    uploaded_proofs.append(proof)
                    logger.info(f"Step 4.{idx}: Image file processed successfully")
            except Exception as file_err:
                logger.error(f"Step 4.{idx} FAILED: Error processing file '{file.filename}': {file_err}", exc_info=True)
                raise
        
        logger.info(f"Step 4 SUCCESS: Processed {len(uploaded_proofs)} proof(s)")
        
        # Step 5: Create timeline event
        logger.info("Step 5: Creating timeline event...")
        from utils.timeline import create_timeline_event
        timeline_event = create_timeline_event(
            event_type="proof_upload",
            user_name="Admin",
            user_role="admin",
            description=f"Uploaded {len(uploaded_proofs)} proof(s) for {stage} stage",
            metadata={"stage": stage, "count": len(uploaded_proofs)}
        )
        logger.info("Step 5 SUCCESS: Timeline event created")
        
        # Step 6: Update order in database
        logger.info("Step 6: Updating order in database...")
        field = f"{stage}_proofs"
        status_field = f"{stage}_status"
        
        update_result = await db.orders.update_one(
            {"id": order_id, "tenant_id": tenant_id},
            {
                "$push": {
                    field: {"$each": uploaded_proofs},
                    "timeline": timeline_event
                },
                "$set": {
                    status_field: "feedback_needed",
                    "last_updated_by": "admin",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        logger.info(f"Step 6 SUCCESS: matched={update_result.matched_count}, modified={update_result.modified_count}")
        
        # Step 7: Send email notification (non-blocking)
        logger.info("Step 7: Sending email notification...")
        emailed_customer = "No"
        if order.get('customer_email'):
            try:
                from utils.helpers import send_customer_proof_notification
                email_sent = await send_customer_proof_notification(
                    db,
                    tenant_id,
                    order,
                    stage,
                    len(uploaded_proofs)
                )
                emailed_customer = "Yes" if email_sent else "No"
                logger.info(f"Step 7 SUCCESS: Email sent={email_sent}")
            except Exception as email_err:
                logger.warning(f"Step 7 WARNING: Email failed but continuing: {email_err}")
                emailed_customer = "No"
        else:
            logger.info("Step 7 SKIPPED: No customer email on order")
        
        # Step 8: Log to Google Sheets (non-blocking)
        logger.info("Step 8: Logging to Google Sheets...")
        try:
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
            logger.info("Step 8 SUCCESS: Logged to sheets")
        except Exception as sheets_err:
            logger.warning(f"Step 8 WARNING: Sheets logging failed but continuing: {sheets_err}")
        
        logger.info(f"=== PROOF UPLOAD COMPLETE === order_id={order_id}, proofs_uploaded={len(uploaded_proofs)}")
        
        return {
            "message": f"Uploaded {len(uploaded_proofs)} proofs (Round {current_round})",
            "proofs": uploaded_proofs,
            "round": current_round
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"=== PROOF UPLOAD FAILED === order_id={order_id}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload proofs: {str(e)}")

@api_router.delete("/admin/orders/{order_id}/proofs/{proof_id}")
async def admin_delete_proof(order_id: str, proof_id: str, stage: str):
    """
    Delete a proof from an order
    """
    logger.info(f"=== PROOF DELETE START === order_id={order_id}, proof_id={proof_id}, stage={stage}")
    
    try:
        # Get tenant
        tenant = await db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=500, detail="No tenant found")
        
        tenant_id = tenant["id"]
        
        # Get order
        order = await db.orders.find_one({
            "id": order_id,
            "tenant_id": tenant_id
        }, {"_id": 0})
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Find and remove the proof from the specified stage
        field = f"{stage}_proofs"
        existing_proofs = order.get(field, [])
        
        # Find the proof to delete
        proof_to_delete = None
        for proof in existing_proofs:
            if proof.get("id") == proof_id:
                proof_to_delete = proof
                break
        
        if not proof_to_delete:
            raise HTTPException(status_code=404, detail="Proof not found")
        
        # Create timeline event
        from utils.timeline import create_timeline_event
        timeline_event = create_timeline_event(
            event_type="proof_deleted",
            user_name="Admin",
            user_role="admin",
            description=f"Deleted proof '{proof_to_delete.get('filename', 'unknown')}' from {stage} stage",
            metadata={"stage": stage, "proof_id": proof_id, "filename": proof_to_delete.get('filename')}
        )
        
        # Remove proof from order
        await db.orders.update_one(
            {"id": order_id, "tenant_id": tenant_id},
            {
                "$pull": {field: {"id": proof_id}},
                "$push": {"timeline": timeline_event},
                "$set": {
                    "last_updated_by": "admin",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Log to sheets
        try:
            from utils.helpers import log_to_sheets
            await log_to_sheets(
                db,
                tenant_id,
                order['order_number'],
                f"Proof Deleted - {stage.capitalize()}",
                f"Deleted: {proof_to_delete.get('filename', 'unknown')}",
                stage=order.get('stage', ''),
                status=order.get(f'{stage}_status', ''),
                emailed_customer="No"
            )
        except Exception as sheets_err:
            logger.warning(f"Sheets logging failed: {sheets_err}")
        
        logger.info(f"=== PROOF DELETE COMPLETE === order_id={order_id}, proof_id={proof_id}")
        
        return {"message": "Proof deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== PROOF DELETE FAILED === order_id={order_id}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete proof: {str(e)}")

# Analytics endpoint
@api_router.get("/admin/analytics")
async def get_analytics(days: int = 7, compare_days: int = 7):
    """Get dashboard analytics - shows current state of all orders with comparison"""
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

# ============== WORKFLOW SCHEDULER ==============

@api_router.post("/admin/workflow/run-scheduler")
async def run_workflow_scheduler():
    """
    Manually trigger the workflow scheduler to process time-delay rules.
    Useful for testing or forcing immediate processing.
    """
    try:
        from utils.workflow_scheduler import run_scheduler_once
        processed = await run_scheduler_once()
        return {
            "success": True,
            "message": f"Workflow scheduler completed",
            "orders_processed": processed
        }
    except Exception as e:
        logger.error(f"Manual scheduler run failed: {e}")
        raise HTTPException(status_code=500, detail=f"Scheduler error: {str(e)}")

@api_router.get("/admin/workflow/time-delay-rules")
async def get_time_delay_rules():
    """
    Get all time-delay workflow rules and their current status.
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    rules = workflow_config.get("rules", [])
    
    time_delay_rules = [r for r in rules if r.get("trigger") == "time_delay"]
    
    # For each rule, count how many orders are currently in the "from" state
    rule_stats = []
    for rule in time_delay_rules:
        from_stage = rule.get("fromStage")
        from_status = rule.get("fromStatus")
        status_field = f"{from_stage}_status"
        
        count = await db.orders.count_documents({
            "tenant_id": tenant["id"],
            "stage": from_stage,
            status_field: from_status,
            "$or": [
                {"is_archived": False},
                {"is_archived": {"$exists": False}}
            ]
        })
        
        rule_stats.append({
            **rule,
            "orders_in_queue": count
        })
    
    return {
        "rules": rule_stats,
        "scheduler_interval_minutes": 5
    }

# ============== END WORKFLOW SCHEDULER ==============

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
    
    # Get workflow config from database - single source of truth for stages/statuses
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", get_default_workflow_config())
    first_stage = get_first_stage(workflow_config)
    first_status = get_first_status_for_stage(workflow_config, first_stage)
    
    # Get Shopify config from tenant
    shopify_shop_name = tenant.get("shopify_shop_name")
    shopify_access_token = tenant.get("shopify_access_token")
    
    if not shopify_shop_name or not shopify_access_token:
        raise HTTPException(status_code=400, detail="Shopify not configured. Please add your Shopify credentials in Settings → Integrations.")
    
    # Initialize Shopify session
    shopify_api_version = "2024-10"
    session = shopify.Session(f"{shopify_shop_name}.myshopify.com", shopify_api_version, shopify_access_token)
    shopify.ShopifyResource.activate_session(session)
    
    try:
        # Fetch orders - get recent orders first (sorted by created_at desc by default)
        # Use since_id to get orders newer than what we have, or fetch all recent ones
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
                    # Use workflow config for default stage/status (single source of truth)
                    "stage": "fulfilled" if fulfillment_status == "fulfilled" else first_stage,
                    f"{first_stage}_status": first_status,
                    # Initialize other stage statuses as pending (will be populated when order moves to that stage)
                    "clay_status": first_status if first_stage == "clay" else "pending",
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
        error_msg = str(e)
        logging.error(f"Shopify sync error: {error_msg}")
        
        # Check for common Shopify errors
        if "401" in error_msg or "Unauthorized" in error_msg or "Invalid API key" in error_msg:
            raise HTTPException(
                status_code=401, 
                detail="Shopify authentication failed. Your API credentials may be invalid or expired. Please update them in Settings → Integrations."
            )
        elif "403" in error_msg or "Forbidden" in error_msg:
            raise HTTPException(
                status_code=403,
                detail="Shopify access denied. Your API token may not have the required permissions (read_orders)."
            )
        elif "404" in error_msg:
            raise HTTPException(
                status_code=404,
                detail="Shopify store not found. Please check your shop name in Settings → Integrations."
            )
        else:
            raise HTTPException(status_code=500, detail=f"Shopify sync failed: {error_msg}")

# Customer routes (public - no auth required)
@api_router.get("/customer/lookup")
async def lookup_order(email: str, order_number: str):
    """Customer lookup by email and order number"""
    # Normalize order number - remove any spaces or special characters
    order_number = order_number.strip()
    
    # Build list of order number variations to try
    order_variations = [
        order_number,                    # Exact as entered
        f"20{order_number}",             # With "20" prefix added
    ]
    
    # If it starts with "20", also try without it
    if order_number.startswith("20") and len(order_number) > 2:
        order_variations.append(order_number[2:])
    
    # Try each variation
    order = None
    for variation in order_variations:
        order = await db.orders.find_one(
            {"customer_email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}, "order_number": variation},
            {"_id": 0}
        )
        if order:
            break
    
    if not order:
        # Log for debugging
        logging.info(f"Customer lookup failed - email: {email}, order_number: {order_number}, tried: {order_variations}")
        raise HTTPException(status_code=404, detail="Order not found. Please check your email and order number.")
    
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
    from utils.workflow_rules_engine import get_workflow_engine_from_tenant
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get tenant settings for workflow configuration
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) if tenant_id else None
    
    # Initialize workflow engine with rules
    workflow_engine = get_workflow_engine_from_tenant(tenant.get("settings", {}) if tenant else {})
    
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
    
    # Create timeline event
    from utils.timeline import create_timeline_event
    if status == "approved":
        timeline_event = create_timeline_event(
            event_type="approval",
            user_name=order.get('customer_name', 'Customer'),
            user_role="customer",
            description=f"Approved {stage} proofs",
            metadata={"stage": stage}
        )
    else:
        timeline_event = create_timeline_event(
            event_type="changes_requested",
            user_name=order.get('customer_name', 'Customer'),
            user_role="customer",
            description=f"Requested changes for {stage} stage",
            metadata={"stage": stage, "message": message, "images": additional_images}
        )
    
    await db.orders.update_one(
        {"id": order_id}, 
        {
            "$set": update_data,
            "$push": {"timeline": timeline_event}
        }
    )
    
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
            import base64
            
            # Prepare image attachments if customer uploaded reference images
            email_attachments = []
            if additional_images:
                for idx, img_data_uri in enumerate(additional_images):
                    # Extract base64 data from data URI (format: data:image/jpeg;base64,...)
                    if ',' in img_data_uri:
                        base64_data = img_data_uri.split(',')[1]
                        img_bytes = base64.b64decode(base64_data)
                        email_attachments.append({
                            'data': img_bytes,
                            'cid': f'customer_ref_{idx}'
                        })
            
            admin_email = tenant.get("smtp_from_email", "orders@allbobbleheads.com")
            await send_email(tenant, admin_email, subject, html_content, attachments=email_attachments)
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
            <a href="{os.environ.get('FRONTEND_URL', 'https://proof-portal.preview.emergentagent.com')}/customer" 
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
        from utils.timeline import create_timeline_event
        
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
        
        # Add timeline event and update last_updated_at
        now = datetime.now(timezone.utc)
        timeline_event = create_timeline_event(
            event_type="ping",
            user_name="Admin",
            user_role="admin",
            description=f"Sent reminder to customer for {stage} stage",
            metadata={"stage": stage, "email": order['customer_email']}
        )
        
        await db.orders.update_one(
            {"id": order_id},
            {
                "$push": {"timeline": timeline_event},
                "$set": {
                    "updated_at": now.isoformat(),
                    "last_updated_at": now.isoformat()
                }
            }
        )
        
        return {"message": "Reminder email sent successfully"}
    except Exception as e:
        logging.error(f"Failed to send reminder email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send reminder email")

# ============== ADMIN REPLY TO CUSTOMER ==============

@api_router.post("/admin/orders/{order_id}/reply")
async def admin_reply_to_customer(order_id: str, message_data: dict):
    """
    Admin sends a reply email to customer regarding their change request.
    The message is emailed to the customer and logged in the order timeline.
    """
    message = message_data.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
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
    
    # Create timeline event for the reply
    from utils.timeline import create_timeline_event
    timeline_event = create_timeline_event(
        event_type="admin_reply",
        user_name="Admin",
        user_role="admin",
        description="Sent reply to customer",
        metadata={"message": message}
    )
    
    # Update order timeline
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {
            "$push": {"timeline": timeline_event},
            "$set": {
                "last_updated_by": "admin",
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Send email to customer
    emailed_customer = "No"
    if order.get('customer_email'):
        try:
            from email_templates import get_admin_reply_email
            from utils.helpers import send_email
            
            logo_url = tenant.get("settings", {}).get("logo_url")
            company_name = tenant.get("name", "AllBobbleheads")
            frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
            portal_url = tenant.get("settings", {}).get("customer_portal_url", f"{frontend_url}/customer")
            
            subject, html_content = get_admin_reply_email(
                order['order_number'],
                order.get('customer_name', 'Valued Customer'),
                message,
                portal_url=portal_url,
                logo_url=logo_url,
                company_name=company_name
            )
            
            await send_email(tenant, order['customer_email'], subject, html_content)
            emailed_customer = "Yes"
            logger.info(f"Admin reply email sent for order {order['order_number']} to {order['customer_email']}")
        except Exception as e:
            logger.error(f"Failed to send admin reply email: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="No customer email on this order")
    
    # Log to sheets
    try:
        from utils.helpers import log_to_sheets
        await log_to_sheets(
            db,
            tenant_id,
            order['order_number'],
            "Admin Reply Sent",
            message[:100] + "..." if len(message) > 100 else message,
            stage=order.get('stage', ''),
            status=order.get(f"{order.get('stage', 'clay')}_status", ''),
            emailed_customer=emailed_customer
        )
    except Exception as e:
        logger.warning(f"Failed to log to sheets: {e}")
    
    return {
        "message": "Reply sent successfully",
        "email_sent": True
    }

# ============== END ADMIN REPLY ==============

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

# Health check endpoints (not behind /api prefix for Kubernetes probes)
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness probe"""
    return {"status": "healthy", "service": "backend"}

@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint for Kubernetes readiness probe"""
    try:
        # Check MongoDB connection
        await db.command("ping")
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logging.error(f"Readiness check failed: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

@app.get("/")
async def app_root():
    """Root endpoint for the application"""
    return {"message": "Bobblehead Order Approval System", "status": "running", "version": "2.0"}

@app.get("/api/debug-database")
async def debug_database():
    """
    Debug endpoint to check database contents
    """
    try:
        # Count documents in each collection
        users_count = await db.users.count_documents({})
        orders_count = await db.orders.count_documents({})
        tenants_count = await db.tenants.count_documents({})
        
        # Get tenant info
        tenant = await db.tenants.find_one({}, {"_id": 0})
        tenant_id = tenant.get("id") if tenant else None
        
        # Get some sample data
        sample_orders = await db.orders.find({}, {"_id": 0}).limit(3).to_list(3)
        sample_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).limit(5).to_list(5)
        
        return {
            "status": "ok",
            "database_connected": True,
            "database_name": db.name,
            "collections": {
                "users": users_count,
                "orders": orders_count,
                "tenants": tenants_count
            },
            "tenant_id": tenant_id,
            "sample_orders": [{"id": o.get("id"), "order_number": o.get("order_number"), "customer_name": o.get("customer_name")} for o in sample_orders],
            "sample_users": [{"username": u.get("username"), "role": u.get("role")} for u in sample_users],
            "message": f"Database has {users_count} users, {orders_count} orders, {tenants_count} tenants"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to query database"
        }

@app.get("/api/debug-routes")
async def debug_routes():
    """
    Debug endpoint to check which routes are available
    """
    routes_list = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            for method in route.methods:
                routes_list.append({
                    "method": method,
                    "path": route.path,
                    "name": route.name
                })
    
    return {
        "status": "ok",
        "total_routes": len(routes_list),
        "routes": sorted(routes_list, key=lambda x: x['path']),
        "key_endpoints": {
            "create_order": any(r['path'] == '/api/orders/' and r['method'] == 'POST' for r in routes_list),
            "get_users": any(r['path'] == '/api/users/' and r['method'] == 'GET' for r in routes_list),
            "get_settings": any(r['path'] == '/api/settings/tenant' and r['method'] == 'GET' for r in routes_list),
            "shopify_sync": any(r['path'] == '/api/settings/shopify/sync' and r['method'] == 'POST' for r in routes_list)
        }
    }

@app.get("/api/debug-login")
async def debug_login():
    """
    Debug endpoint to check login configuration
    """
    try:
        # Check database connection
        admin = await db.users.find_one({"username": "admin"}, {"_id": 0})
        
        # Check password hash
        import hashlib
        expected_hash = hashlib.sha256("admin123".encode()).hexdigest()
        
        if not admin:
            return {
                "status": "error",
                "issue": "admin_user_not_found",
                "message": "Admin user does not exist in database",
                "solution": "Visit /api/setup-admin to create the admin user"
            }
        
        password_match = admin.get("password_hash") == expected_hash
        
        return {
            "status": "ok" if password_match else "error",
            "admin_exists": True,
            "password_hash_correct": password_match,
            "admin_username": admin.get("username"),
            "admin_role": admin.get("role"),
            "admin_active": admin.get("is_active"),
            "stored_hash": admin.get("password_hash")[:20] + "...",
            "expected_hash": expected_hash[:20] + "...",
            "database_connected": True
        }
    except Exception as e:
        return {
            "status": "error",
            "issue": "database_connection_failed",
            "error": str(e),
            "message": "Cannot connect to database. Check MONGO_URL and DB_NAME environment variables."
        }

@app.get("/api/setup-admin")
async def setup_admin():
    """
    One-time setup endpoint to create admin user in production
    Only works if no admin user exists (security measure)
    """
    try:
        import hashlib
        from datetime import datetime, timezone
        from uuid import uuid4
        
        # Check if admin already exists
        existing_admin = await db.users.find_one({"username": "admin"}, {"_id": 0})
        if existing_admin:
            return {
                "success": True,
                "message": "Admin user already exists! You can log in with: admin / admin123",
                "status": "already_configured"
            }
        
        # Get or create default tenant
        tenant = await db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            # Create default tenant
            tenant_id = str(uuid4())
            tenant = {
                "id": tenant_id,
                "name": "Default Company",
                "subdomain": "default",
                "settings": {
                    "workflow": {
                        "clay": {
                            "stages": ["pending", "sculpting", "feedback_needed", "changes_requested", "approved"],
                            "default_status": "pending"
                        },
                        "paint": {
                            "stages": ["pending", "painting", "feedback_needed", "changes_requested", "approved"],
                            "default_status": "pending"
                        }
                    }
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.tenants.insert_one(tenant)
            logger.info(f"✅ Created default tenant: {tenant_id}")
        else:
            tenant_id = tenant["id"]
        
        # Create admin user
        admin_user = {
            "id": str(uuid4()),
            "username": "admin",
            "password_hash": hashlib.sha256("admin123".encode()).hexdigest(),
            "full_name": "Main Administrator",
            "email": "admin@company.com",
            "role": "admin",
            "tenant_id": tenant_id,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.users.insert_one(admin_user)
        logger.info("✅ Admin user created successfully")
        
        return {
            "success": True,
            "message": "🎉 Admin user created successfully! You can now log in with:",
            "credentials": {
                "username": "admin",
                "password": "admin123"
            },
            "instructions": "Go to your login page and use these credentials to sign in."
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to create admin user: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to create admin user: {str(e)}"
        }

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
