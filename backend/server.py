from fastapi import FastAPI, APIRouter, HTTPException, Form, File, UploadFile
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
import os
import re
import logging
import asyncio
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

# MongoDB connection with optimized settings for reliability
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
    
    # Optimized connection settings for reliability and performance in production
    client = AsyncIOMotorClient(
        mongo_url,
        serverSelectionTimeoutMS=30000,   # 30 seconds to select server (increased for Atlas)
        connectTimeoutMS=30000,            # 30 seconds to connect (increased for Atlas)
        socketTimeoutMS=60000,             # 60 seconds for socket operations (increased for slow queries)
        maxPoolSize=100,                   # Connection pool size (increased for production)
        minPoolSize=5,                     # Minimum connections to keep (reduced to avoid idle connections)
        maxIdleTimeMS=45000,               # Close idle connections after 45s
        retryWrites=True,                  # Retry failed writes
        retryReads=True,                   # Retry failed reads
        waitQueueTimeoutMS=30000,          # 30 seconds to wait for connection from pool
    )
    db = client[db_name]
    logger.info(f"✅ MongoDB client initialized for database: {db_name}")
except Exception as e:
    logger.error(f"❌ Failed to initialize MongoDB connection: {str(e)}")
    raise

# Helper function for database operations with retry
async def db_operation_with_retry(operation, max_retries=3, delay=1):
    """Execute a database operation with retry logic for transient failures"""
    last_exception = None
    for attempt in range(max_retries):
        try:
            return await operation()
        except Exception as e:
            last_exception = e
            error_str = str(e).lower()
            # Check if it's a transient error worth retrying
            if any(x in error_str for x in ['timeout', 'connection', 'network', 'unavailable']):
                logger.warning(f"Database operation attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay * (attempt + 1))  # Exponential backoff
                    continue
            # Non-transient error, don't retry
            raise
    # If we've exhausted retries, raise the last exception
    raise last_exception

# Create the main app without a prefix
app = FastAPI(title="Bobblehead Proof Approval System - Multi-Tenant SaaS")

# Increase max request body size for large file uploads (30MB)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_body_size: int = 30 * 1024 * 1024):  # 30MB default
        super().__init__(app)
        self.max_body_size = max_body_size
    
    async def dispatch(self, request: Request, call_next):
        # Check content length header
        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > self.max_body_size:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Maximum size is {self.max_body_size // (1024*1024)}MB"}
            )
        return await call_next(request)

# Add middleware for large file uploads
app.add_middleware(MaxBodySizeMiddleware, max_body_size=30 * 1024 * 1024)  # 30MB

# Root-level health check (no database dependency) for Kubernetes probes
@app.get("/health")
async def root_health():
    """Basic health check - responds immediately without database check"""
    return {"status": "ok", "service": "orderdesk-backend"}

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
    
    # Test MongoDB connection with timeout - don't block startup if slow
    try:
        await asyncio.wait_for(db.command("ping"), timeout=10.0)
        logger.info("✅ MongoDB connection successful")
    except asyncio.TimeoutError:
        logger.warning("⚠️ MongoDB connection timed out - will retry on first request")
    except Exception as e:
        logger.warning(f"⚠️ MongoDB connection check failed: {str(e)} - will retry on first request")
    
    # Ensure indexes exist for performance (idempotent - won't recreate if exists)
    try:
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("stage", 1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("is_archived", 1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("created_at", -1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("updated_at", -1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("stage", 1), ("is_archived", 1), ("created_at", -1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("order_number", 1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("customer_email", 1)]), timeout=5.0)
        await asyncio.wait_for(db.orders.create_index([("customer_name", 1)]), timeout=5.0)
        # Index for Shopify sync - speeds up checking existing orders
        await asyncio.wait_for(db.orders.create_index([("tenant_id", 1), ("shopify_order_id", 1)]), timeout=5.0)
        # Text index for fast search across multiple fields
        try:
            await asyncio.wait_for(
                db.orders.create_index([
                    ("order_number", "text"),
                    ("customer_email", "text"),
                    ("customer_name", "text")
                ], default_language="english", name="search_text_index"),
                timeout=5.0
            )
        except Exception:
            pass  # Text index might already exist with different config
        logger.info("✅ MongoDB indexes ensured")
    except asyncio.TimeoutError:
        logger.warning("⚠️ Index creation timed out - will be created on next startup")
    except Exception as e:
        logger.warning(f"⚠️ Could not create indexes: {e}")
    
    # Data migration: Normalize is_archived field for all orders (one-time migration)
    # This ensures all orders have a consistent is_archived field for faster queries
    # Skip if it takes too long - can be done later
    try:
        # Set is_archived=True for orders with archived=True (legacy field)
        result1 = await asyncio.wait_for(
            db.orders.update_many(
                {"archived": True, "is_archived": {"$ne": True}},
                {"$set": {"is_archived": True}}
            ),
            timeout=10.0
        )
        # Set is_archived=False for orders without is_archived field
        result2 = await asyncio.wait_for(
            db.orders.update_many(
                {"is_archived": {"$exists": False}},
                {"$set": {"is_archived": False}}
            ),
            timeout=10.0
        )
        # Set is_archived=False for orders with is_archived=None
        result3 = await asyncio.wait_for(
            db.orders.update_many(
                {"is_archived": None},
                {"$set": {"is_archived": False}}
            ),
            timeout=10.0
        )
        total_migrated = result1.modified_count + result2.modified_count + result3.modified_count
        if total_migrated > 0:
            logger.info(f"✅ Migrated {total_migrated} orders to normalized is_archived field")
    except asyncio.TimeoutError:
        logger.warning("⚠️ Data migration timed out - will complete on next startup")
    except Exception as e:
        logger.warning(f"⚠️ Data migration warning: {e}")
    
    # Start workflow scheduler as background task
    try:
        from utils.workflow_scheduler import start_scheduler_loop
        asyncio.create_task(start_scheduler_loop(interval_minutes=5))
        logger.info("✅ Workflow scheduler started (runs every 5 minutes)")
    except Exception as e:
        logger.warning(f"⚠️ Could not start workflow scheduler: {e}")
    
    logger.info("✅ Application startup complete")

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

# ============== HEALTH CHECK ENDPOINT ==============
@api_router.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring.
    Returns database connection status and basic system info.
    """
    try:
        # Test database connection
        await db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

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

def get_shipped_stage(workflow_config):
    """Get the shipped stage ID from workflow config. Returns 'shipped' as default."""
    stages = workflow_config.get("stages", [])
    for stage in stages:
        stage_id = stage.get("id", "").lower()
        stage_name = stage.get("name", "").lower()
        # Match by id or name containing "ship"
        if "ship" in stage_id or "ship" in stage_name:
            return stage.get("id")
    # Fallback to "shipped" if not found
    return "shipped"

def get_first_status_for_shipped_stage(workflow_config):
    """Get the first status for the shipped stage."""
    shipped_stage = get_shipped_stage(workflow_config)
    return get_first_status_for_stage(workflow_config, shipped_stage)

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
    try:
        # Get first tenant with retry
        async def get_tenant():
            return await db.tenants.find_one({}, {"_id": 0})
        
        tenant = await db_operation_with_retry(get_tenant)
        if not tenant:
            raise HTTPException(status_code=500, detail="No tenant found")
        
        tenant_id = tenant["id"]
        
        # Build query filter
        query = {"tenant_id": tenant_id}
        
        # Filter by archived status - simple check on normalized is_archived field
        # Data migration at startup ensures all orders have is_archived set to True or False
        if archived is True:
            query["is_archived"] = True
        elif archived is False:
            query["is_archived"] = False
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
        
        # Search filter - need to handle $and/$or conflict properly
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            search_conditions = [
                {"order_number": search_regex},
                {"customer_email": search_regex},
                {"customer_name": search_regex}
            ]
            # When combining search with other filters, we need to use $and
            # to ensure both the search OR conditions AND other filters apply
            existing_conditions = {k: v for k, v in query.items() if k not in ["$and", "$or"]}
            query = {
                "$and": [
                    existing_conditions,
                    {"$or": search_conditions}
                ]
            }
        
        # Get total count for pagination with retry
        async def get_count():
            return await db.orders.count_documents(query)
        
        total_count = await db_operation_with_retry(get_count)
        total_pages = (total_count + limit - 1) // limit  # Ceiling division
        
        # Calculate skip for pagination
        skip = (page - 1) * limit
        
        # Projection: Exclude heavy fields for list view (timeline, proofs, notes, approval details)
        # These fields are only needed when viewing a single order's details
        list_projection = {
            "_id": 0,
            "timeline": 0,
            "clay_proofs": 0,
            "paint_proofs": 0,
            "notes": 0,
            "clay_approval": 0,
            "paint_approval": 0,
            "line_items": 0,  # Usually not needed in list view
        }
        
        # Fetch paginated orders with lightweight projection and retry
        async def get_orders():
            return await db.orders.find(query, list_projection).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        orders = await db_operation_with_retry(get_orders)
        
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching orders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@api_router.get("/admin/orders/counts")
async def get_orders_counts():
    """
    Get order counts by stage/status for sidebar - dynamically based on workflow config
    """
    try:
        async def get_tenant():
            return await db.tenants.find_one({}, {"_id": 0})
        
        tenant = await db_operation_with_retry(get_tenant)
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
        
        # Simplified filters using normalized is_archived field (much faster queries)
        non_archived_filter = {"is_archived": False}
        archived_filter = {"is_archived": True}
        
        # Build dynamic aggregation pipeline
        facet_stages = {
            # Total count should EXCLUDE archived orders (for "All Orders" folder)
            "total": [
                {"$match": non_archived_filter},
                {"$count": "count"}
            ],
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
                    {"$match": {"stage": stage_id, "is_archived": False}},
                    {"$group": {"_id": f"${status_field}", "count": {"$sum": 1}}}
                ]
        
        pipeline = [
            {"$match": {"tenant_id": tenant_id}},
            {"$facet": facet_stages}
        ]
        
        # Run aggregation with retry
        async def run_aggregation():
            return await db.orders.aggregate(pipeline).to_list(1)
        
        result = await db_operation_with_retry(run_aggregation)
        
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
                    if stage_id == "paint" and "sculpting" in stage_counts:
                        painting_count = stage_counts.get("painting", 0) + stage_counts.get("sculpting", 0)
                        stage_counts["painting"] = painting_count
                        del stage_counts["sculpting"]
                    
                    status_counts[stage_id] = stage_counts
        
        return {
            "total": data["total"][0]["count"] if data["total"] else 0,
            "archived": data["archived"][0]["count"] if data["archived"] else 0,
            "by_stage": {item["_id"]: item["count"] for item in data["by_stage"] if item["_id"]},
            "status_counts": status_counts
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching order counts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

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
    
    # Check if tracking is being added (didn't have tracking before, now has it)
    tracking_being_added = (
        "tracking_number" in update_data and 
        update_data["tracking_number"] and 
        not order.get("tracking_number")
    )
    
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if "order_number" in update_data:
        update_fields["order_number"] = update_data["order_number"]
    if "customer_name" in update_data:
        update_fields["customer_name"] = update_data["customer_name"]
    if "customer_email" in update_data:
        update_fields["customer_email"] = update_data["customer_email"]
    # Add tracking fields
    if "tracking_number" in update_data:
        update_fields["tracking_number"] = update_data["tracking_number"]
    if "carrier" in update_data:
        update_fields["carrier"] = update_data["carrier"]
        update_fields["tracking_company"] = update_data["carrier"]  # Keep both for compatibility
    if "tracking_url" in update_data:
        update_fields["tracking_url"] = update_data["tracking_url"]
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {"$set": update_fields}
    )
    
    # Process "tracking_number_added" workflow rules if tracking was just added
    workflow_applied = None
    if tracking_being_added:
        workflow_applied = await process_tracking_added_workflow(tenant, order, update_fields)
    
    response = {"message": "Order updated successfully"}
    if workflow_applied:
        response["workflow_applied"] = workflow_applied
    
    return response


async def process_tracking_added_workflow(tenant, order, update_fields):
    """
    Process workflow rules that trigger on "tracking_number_added" or "tracking_added".
    Finds matching rules based on the order's current stage/status and applies them.
    """
    try:
        settings = tenant.get("settings", {})
        workflow_config = settings.get("workflow_config", {})
        rules = workflow_config.get("rules", [])
        
        # Filter to tracking rules (check both trigger names for compatibility)
        tracking_rules = [r for r in rules if r.get("trigger") in ["tracking_number_added", "tracking_added"]]
        
        if not tracking_rules:
            return None
        
        current_stage = order.get("stage")
        current_status = order.get(f"{current_stage}_status")
        
        logger.info(f"Processing tracking_number_added rules for order {order.get('order_number')} (stage: {current_stage}, status: {current_status})")
        
        # Find matching rule
        matching_rule = None
        for rule in tracking_rules:
            from_stage = rule.get("from_stage")
            from_status = rule.get("from_status")
            
            if from_stage == current_stage and from_status == current_status:
                matching_rule = rule
                break
        
        if not matching_rule:
            logger.info(f"No matching tracking_number_added rule found for stage={current_stage}, status={current_status}")
            return None
        
        # Apply the rule - transition to new stage/status
        to_stage = matching_rule.get("to_stage")
        to_status = matching_rule.get("to_status")
        email_action = matching_rule.get("email_action")
        
        logger.info(f"Applying workflow rule: {current_stage}/{current_status} -> {to_stage}/{to_status}")
        
        # Build update for the transition
        transition_update = {
            "stage": to_stage,
            f"{to_stage}_status": to_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "last_updated_by": "workflow_rule",
            "last_updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Set entered_at timestamp if moving to a new stage
        if to_stage != current_stage:
            transition_update[f"{to_stage}_entered_at"] = datetime.now(timezone.utc).isoformat()
        
        # Add timeline entry
        timeline_entry = {
            "id": str(__import__('uuid').uuid4()),
            "type": "workflow",
            "message": f"Auto-transitioned to {to_stage}/{to_status} (tracking number added)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "created_by": "workflow_rule",
            "metadata": {
                "trigger": "tracking_number_added",
                "from_stage": current_stage,
                "from_status": current_status,
                "to_stage": to_stage,
                "to_status": to_status,
                "tracking_number": update_fields.get("tracking_number")
            }
        }
        
        await db.orders.update_one(
            {"id": order["id"], "tenant_id": tenant["id"]},
            {
                "$set": transition_update,
                "$push": {"timeline": timeline_entry}
            }
        )
        
        # Send email if configured
        if email_action and email_action != "none":
            try:
                from utils.workflow_scheduler import send_workflow_email
                # Get updated order for email
                updated_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
                await send_workflow_email(db, tenant, updated_order, to_stage, to_status, email_action)
            except Exception as e:
                logger.error(f"Failed to send workflow email: {e}")
        
        # Sync tags to Shopify if configured
        if order.get("shopify_order_id"):
            try:
                await sync_order_tags_to_shopify(order.get("shopify_order_id"), to_stage, to_status)
            except Exception as e:
                logger.warning(f"Failed to sync tags to Shopify: {e}")
        
        return {
            "from_stage": current_stage,
            "from_status": current_status,
            "to_stage": to_stage,
            "to_status": to_status,
            "trigger": "tracking_number_added"
        }
        
    except Exception as e:
        logger.error(f"Error processing tracking_number_added workflow: {e}")
        return None

# Alias route for frontend compatibility (without /info suffix)
@api_router.patch("/admin/orders/{order_id}")
async def update_admin_order(order_id: str, update_data: dict):
    """
    Update order info for admin - alias route for frontend compatibility
    """
    return await update_admin_order_info(order_id, update_data)

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


async def sync_order_tags_to_shopify(shopify_order_id: str, stage: str, status: str, tenant_settings: dict, workflow_config: dict = None):
    """
    Sync order stage/status as tags to Shopify in format "Stage - Status"
    
    Args:
        shopify_order_id: The Shopify order ID
        stage: The current stage (e.g., 'clay', 'paint')
        status: The current status (e.g., 'sculpting', 'feedback_needed')
        tenant_settings: Tenant settings containing Shopify credentials
        workflow_config: Optional workflow config to get display labels
    """
    try:
        import shopify
        
        shopify_shop_name = tenant_settings.get("shopify_shop_name")
        shopify_access_token = tenant_settings.get("shopify_access_token")
        
        if not shopify_shop_name or not shopify_access_token:
            logger.warning("Shopify not configured, skipping tag sync")
            return False
        
        if not shopify_order_id:
            logger.warning("No Shopify order ID, skipping tag sync")
            return False
        
        # Get display labels from workflow config if available
        stage_label = stage.capitalize()
        status_label = status.replace('_', ' ').title()
        
        if workflow_config and workflow_config.get("stages"):
            for s in workflow_config["stages"]:
                if s.get("id") == stage:
                    stage_label = s.get("name", stage_label)
                    for st in s.get("statuses", []):
                        if st.get("id") == status:
                            status_label = st.get("name", status_label)
                            break
                    break
        
        # Create the tag in "Stage - Status" format
        new_tag = f"{stage_label} - {status_label}"
        
        # Initialize Shopify session
        shopify_api_version = "2024-10"
        session = shopify.Session(
            f"{shopify_shop_name}.myshopify.com",
            shopify_api_version,
            shopify_access_token
        )
        shopify.ShopifyResource.activate_session(session)
        
        try:
            # Get the order
            shopify_order = shopify.Order.find(shopify_order_id)
            
            if not shopify_order:
                logger.warning(f"Shopify order {shopify_order_id} not found")
                return False
            
            # Get existing tags
            existing_tags = shopify_order.tags or ""
            tag_list = [t.strip() for t in existing_tags.split(",") if t.strip()]
            
            # Remove any existing "Stage - Status" format tags (from our app)
            # We identify them by checking if they contain " - " and the first part is a known stage
            known_stages = ["Clay", "Paint", "Shipped", "Archived", "Fulfilled", "Canceled"]
            if workflow_config and workflow_config.get("stages"):
                known_stages = [s.get("name", s.get("id", "").capitalize()) for s in workflow_config["stages"]]
            
            filtered_tags = []
            for tag in tag_list:
                is_stage_tag = False
                if " - " in tag:
                    tag_stage = tag.split(" - ")[0].strip()
                    if tag_stage in known_stages:
                        is_stage_tag = True
                if not is_stage_tag:
                    filtered_tags.append(tag)
            
            # Add the new tag
            filtered_tags.append(new_tag)
            
            # Update the order tags
            shopify_order.tags = ", ".join(filtered_tags)
            shopify_order.save()
            
            logger.info(f"Synced tag '{new_tag}' to Shopify order {shopify_order_id}")
            return True
            
        finally:
            shopify.ShopifyResource.clear_session()
            
    except Exception as e:
        logger.error(f"Failed to sync tags to Shopify for order {shopify_order_id}: {e}")
        return False

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
    
    # Sync tags to Shopify (non-blocking) when stage or status changes
    if order.get("shopify_order_id") and ("stage" in update_data or "clay_status" in update_data or "paint_status" in update_data):
        import asyncio
        try:
            # Determine current stage and status after update
            final_stage = update_fields.get("stage", order.get("stage", "clay"))
            final_status = update_fields.get(f"{final_stage}_status") or order.get(f"{final_stage}_status", "pending")
            
            # Get workflow config for display labels
            settings = tenant.get("settings", {})
            workflow_config = settings.get("workflow_config", {})
            
            asyncio.create_task(sync_order_tags_to_shopify(
                order["shopify_order_id"],
                final_stage,
                final_status,
                tenant,
                workflow_config
            ))
            logger.info(f"Scheduled Shopify tag sync for order {order_id}: {final_stage} - {final_status}")
        except Exception as e:
            logger.warning(f"Could not schedule Shopify tag sync for order {order_id}: {e}")
    
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
    clear_other_stage: bool = Form(False),
    files: List[UploadFile] = File(...)
):
    """
    Upload proofs from admin order details page
    Optimized for handling zip files up to 25MB with image compression
    
    Args:
        clear_other_stage: If True, clears proofs from the other stage to free up space
    """
    import base64
    import zipfile
    import io
    import uuid
    from PIL import Image
    
    # Maximum file size: 25MB for zip files
    MAX_ZIP_SIZE = 25 * 1024 * 1024  # 25MB
    MAX_IMAGE_SIZE = 15 * 1024 * 1024  # 15MB per image (before compression)
    TARGET_IMAGE_SIZE = 300 * 1024  # Target 300KB per image after compression (reduced for safety)
    MAX_IMAGE_DIMENSION = 1500  # Max width/height in pixels (reduced)
    
    def compress_image(image_data: bytes, filename: str) -> tuple:
        """Compress image to reduce size for MongoDB storage and fix EXIF orientation"""
        try:
            img = Image.open(io.BytesIO(image_data))
            
            # Fix EXIF orientation - this is crucial for mobile photos
            try:
                from PIL import ExifTags
                
                # Find the orientation tag
                orientation_key = None
                for key in ExifTags.TAGS.keys():
                    if ExifTags.TAGS[key] == 'Orientation':
                        orientation_key = key
                        break
                
                if orientation_key and hasattr(img, '_getexif') and img._getexif():
                    exif = img._getexif()
                    if exif and orientation_key in exif:
                        orientation = exif[orientation_key]
                        
                        # Apply rotation based on EXIF orientation value
                        if orientation == 2:
                            img = img.transpose(Image.FLIP_LEFT_RIGHT)
                        elif orientation == 3:
                            img = img.rotate(180, expand=True)
                        elif orientation == 4:
                            img = img.transpose(Image.FLIP_TOP_BOTTOM)
                        elif orientation == 5:
                            img = img.rotate(-90, expand=True).transpose(Image.FLIP_LEFT_RIGHT)
                        elif orientation == 6:
                            img = img.rotate(-90, expand=True)
                        elif orientation == 7:
                            img = img.rotate(90, expand=True).transpose(Image.FLIP_LEFT_RIGHT)
                        elif orientation == 8:
                            img = img.rotate(90, expand=True)
                        
                        logger.info(f"Fixed EXIF orientation {orientation} for {filename}")
            except Exception as exif_error:
                logger.debug(f"Could not process EXIF data for {filename}: {exif_error}")
            
            # Convert RGBA to RGB for JPEG (drop alpha channel)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # Resize if too large
            if img.width > MAX_IMAGE_DIMENSION or img.height > MAX_IMAGE_DIMENSION:
                img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
            
            # Compress to JPEG with quality adjustment
            output = io.BytesIO()
            quality = 85
            
            # Progressive compression until under target size
            while quality >= 30:
                output.seek(0)
                output.truncate()
                img.save(output, format='JPEG', quality=quality, optimize=True)
                if output.tell() <= TARGET_IMAGE_SIZE:
                    break
                quality -= 10
            
            output.seek(0)
            compressed_data = output.read()
            
            # Log compression ratio
            original_size = len(image_data)
            compressed_size = len(compressed_data)
            ratio = (1 - compressed_size / original_size) * 100
            logger.info(f"Compressed {filename}: {original_size/1024:.1f}KB -> {compressed_size/1024:.1f}KB ({ratio:.1f}% reduction)")
            
            return compressed_data, 'image/jpeg'
        except Exception as e:
            logger.warning(f"Could not compress image {filename}: {e}, using original")
            return image_data, None
    
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
                    # Handle zip file - optimized for large files up to 20MB
                    logger.info(f"Step 4.{idx}: File is a ZIP, extracting...")
                    
                    # Read file in chunks for memory efficiency
                    chunks = []
                    total_size = 0
                    while True:
                        chunk = await file.read(1024 * 1024)  # Read 1MB at a time
                        if not chunk:
                            break
                        chunks.append(chunk)
                        total_size += len(chunk)
                        if total_size > MAX_ZIP_SIZE:
                            raise HTTPException(status_code=413, detail=f"ZIP file too large. Maximum size is {MAX_ZIP_SIZE // (1024*1024)}MB")
                    
                    content = b''.join(chunks)
                    logger.info(f"Step 4.{idx}: ZIP file size: {total_size / (1024*1024):.2f}MB")
                    
                    with zipfile.ZipFile(io.BytesIO(content)) as zf:
                        # Get list of image files first
                        image_files = [name for name in zf.namelist() 
                                      if name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))
                                      and not name.startswith('__MACOSX')  # Skip Mac metadata
                                      and not name.startswith('.')  # Skip hidden files
                                      ]
                        logger.info(f"Step 4.{idx}: Found {len(image_files)} images in ZIP")
                        
                        for img_idx, name in enumerate(image_files):
                            try:
                                image_data = zf.read(name)
                                if len(image_data) > MAX_IMAGE_SIZE:
                                    logger.warning(f"Skipping large image {name} ({len(image_data) / (1024*1024):.2f}MB)")
                                    continue
                                
                                # Compress image to reduce MongoDB document size
                                compressed_data, compressed_mime = compress_image(image_data, name)
                                image_base64 = base64.b64encode(compressed_data).decode('utf-8')
                                
                                # Determine MIME type
                                if compressed_mime:
                                    mime_type = compressed_mime
                                else:
                                    ext = name.lower().split('.')[-1]
                                    mime_type = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
                                                'gif': 'image/gif', 'webp': 'image/webp'}.get(ext, 'image/jpeg')
                                
                                # Get just the filename without directory path
                                clean_filename = name.split('/')[-1]
                                
                                proof = {
                                    "id": str(uuid.uuid4()),
                                    "url": f"data:{mime_type};base64,{image_base64}",
                                    "filename": clean_filename,
                                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                                    "round": current_round,
                                    "revision_note": revision_note
                                }
                                uploaded_proofs.append(proof)
                                
                                if (img_idx + 1) % 10 == 0:
                                    logger.info(f"Step 4.{idx}: Processed {img_idx + 1}/{len(image_files)} images")
                            except Exception as img_err:
                                logger.warning(f"Failed to process image {name}: {img_err}")
                                continue
                                
                    logger.info(f"Step 4.{idx}: ZIP processed, extracted {len(uploaded_proofs)} images")
                else:
                    # Handle individual image file
                    content = await file.read()
                    if len(content) > MAX_IMAGE_SIZE:
                        raise HTTPException(status_code=413, detail=f"Image file too large. Maximum size is {MAX_IMAGE_SIZE // (1024*1024)}MB")
                    
                    # Compress image to reduce MongoDB document size
                    compressed_data, compressed_mime = compress_image(content, file.filename or 'image.jpg')
                    image_base64 = base64.b64encode(compressed_data).decode('utf-8')
                    
                    # Determine MIME type
                    if compressed_mime:
                        mime_type = compressed_mime
                    else:
                        ext = (file.filename or '').lower().split('.')[-1] if file.filename else 'jpg'
                        mime_type = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 
                                    'gif': 'image/gif', 'webp': 'image/webp'}.get(ext, 'image/jpeg')
                    
                    proof = {
                        "id": str(uuid.uuid4()),
                        "url": f"data:{mime_type};base64,{image_base64}",
                        "filename": file.filename or f"proof_{idx}.jpg",
                        "uploaded_at": datetime.now(timezone.utc).isoformat(),
                        "round": current_round,
                        "revision_note": revision_note
                    }
                    uploaded_proofs.append(proof)
                    logger.info(f"Step 4.{idx}: Image file processed and compressed successfully")
            except HTTPException:
                raise
            except Exception as file_err:
                logger.error(f"Step 4.{idx} FAILED: Error processing file '{file.filename}': {file_err}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to process file: {str(file_err)}")
        
        logger.info(f"Step 4 SUCCESS: Processed {len(uploaded_proofs)} proof(s)")
        
        # Step 5: Calculate total size and check if we need to batch
        total_proof_size = sum(len(p.get('url', '')) for p in uploaded_proofs)
        logger.info(f"Step 5: Total proof data size: {total_proof_size / (1024*1024):.2f}MB")
        
        # MongoDB document size limit is 16MB
        # We need to leave room for other data in the document (~2MB buffer)
        MAX_BATCH_SIZE = 12 * 1024 * 1024  # 12MB per batch to be safe
        
        # Get current proofs size in the document
        current_proofs_field = f"{stage}_proofs"
        current_proofs = order.get(current_proofs_field, [])
        current_proofs_size = sum(len(str(p)) for p in current_proofs)
        
        # Calculate how much room we have
        available_space = MAX_BATCH_SIZE - current_proofs_size
        logger.info(f"Step 5: Current proofs size: {current_proofs_size / (1024*1024):.2f}MB, Available space: {available_space / (1024*1024):.2f}MB")
        
        # If total proofs exceed available space, we need to further compress or batch
        if total_proof_size > available_space:
            logger.warning(f"Proof data ({total_proof_size / (1024*1024):.2f}MB) exceeds available space ({available_space / (1024*1024):.2f}MB). Applying additional compression...")
            
            # Re-compress with smaller target size
            smaller_target = 200 * 1024  # 200KB per image
            compressed_proofs = []
            for proof in uploaded_proofs:
                url = proof.get('url', '')
                if url.startswith('data:'):
                    # Extract and re-compress the image
                    try:
                        base64_part = url.split(',')[1]
                        image_data = base64.b64decode(base64_part)
                        
                        img = Image.open(io.BytesIO(image_data))
                        if img.mode in ('RGBA', 'P'):
                            img = img.convert('RGB')
                        
                        # More aggressive resize
                        max_dim = 1200
                        if img.width > max_dim or img.height > max_dim:
                            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                        
                        # More aggressive compression
                        output = io.BytesIO()
                        quality = 60
                        while quality >= 20:
                            output.seek(0)
                            output.truncate()
                            img.save(output, format='JPEG', quality=quality, optimize=True)
                            if output.tell() <= smaller_target:
                                break
                            quality -= 10
                        
                        output.seek(0)
                        new_base64 = base64.b64encode(output.read()).decode('utf-8')
                        proof['url'] = f"data:image/jpeg;base64,{new_base64}"
                    except Exception as e:
                        logger.warning(f"Could not re-compress proof: {e}")
                
                compressed_proofs.append(proof)
            
            uploaded_proofs = compressed_proofs
            total_proof_size = sum(len(p.get('url', '')) for p in uploaded_proofs)
            logger.info(f"Step 5: After additional compression: {total_proof_size / (1024*1024):.2f}MB")
        
        # Step 5b: Check if we need to clear old proofs to make room
        # MongoDB document limit is 16MB, we need to stay well under
        other_stage = "paint" if stage == "clay" else "clay"
        other_proofs_field = f"{other_stage}_proofs"
        other_proofs = order.get(other_proofs_field, []) or []
        other_proofs_size = sum(len(str(p)) for p in other_proofs)
        
        # Estimate total document size
        estimated_doc_size = current_proofs_size + total_proof_size + other_proofs_size + 500000  # 500KB buffer for other fields
        
        if estimated_doc_size > 15 * 1024 * 1024:  # If over 15MB
            logger.warning(f"Document size ({estimated_doc_size / (1024*1024):.2f}MB) would exceed limit. Clearing old {other_stage} proofs to make room.")
            # Clear the other stage's proofs
            await db.orders.update_one(
                {"id": order_id, "tenant_id": tenant_id},
                {"$set": {other_proofs_field: []}}
            )
            logger.info(f"Cleared {len(other_proofs)} proofs from {other_stage} stage to free space")
        
        # Step 6: Create timeline event
        logger.info("Step 6: Creating timeline event...")
        from utils.timeline import create_timeline_event
        timeline_event = create_timeline_event(
            event_type="proof_upload",
            user_name="Admin",
            user_role="admin",
            description=f"Uploaded {len(uploaded_proofs)} proof(s) for {stage} stage",
            metadata={"stage": stage, "count": len(uploaded_proofs)}
        )
        logger.info("Step 6 SUCCESS: Timeline event created")
        
        # Step 7: Update order in database
        # Replace existing proofs for this stage (not append) to avoid document size issues
        logger.info("Step 7: Updating order in database...")
        field = f"{stage}_proofs"
        status_field = f"{stage}_status"
        
        # Get existing proofs to archive the round info
        existing_proofs = order.get(field, [])
        max_existing_round = max([p.get('round', 0) for p in existing_proofs], default=0) if existing_proofs else 0
        
        # If this is a new round and we have existing proofs, archive them by storing round info
        if existing_proofs and current_round > max_existing_round:
            # Keep only the new proofs, but log how many were replaced
            logger.info(f"Step 7: Replacing {len(existing_proofs)} existing proofs with {len(uploaded_proofs)} new proofs")
        
        update_result = await db.orders.update_one(
            {"id": order_id, "tenant_id": tenant_id},
            {
                "$set": {
                    field: uploaded_proofs,  # Replace, don't append
                    status_field: "feedback_needed",
                    "last_updated_by": "admin",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {
                    "timeline": timeline_event
                }
            }
        )
        logger.info(f"Step 7 SUCCESS: matched={update_result.matched_count}, modified={update_result.modified_count}")
        
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

@api_router.post("/admin/orders/{order_id}/proofs/bulk-delete")
async def admin_bulk_delete_proofs(order_id: str, request_data: dict):
    """
    Delete multiple proofs from an order at once
    Request body: { "proof_ids": ["id1", "id2", ...], "stage": "clay" | "paint" }
    """
    proof_ids = request_data.get("proof_ids", [])
    stage = request_data.get("stage")
    
    if not proof_ids:
        raise HTTPException(status_code=400, detail="No proof IDs provided")
    if not stage:
        raise HTTPException(status_code=400, detail="Stage is required")
    
    logger.info(f"=== BULK PROOF DELETE START === order_id={order_id}, count={len(proof_ids)}, stage={stage}")
    
    try:
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
        
        field = f"{stage}_proofs"
        existing_proofs = order.get(field, [])
        
        # Find proofs to delete
        proofs_to_delete = [p for p in existing_proofs if p.get("id") in proof_ids]
        deleted_count = len(proofs_to_delete)
        
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="No matching proofs found")
        
        # Create timeline event
        from utils.timeline import create_timeline_event
        timeline_event = create_timeline_event(
            event_type="proofs_bulk_deleted",
            user_name="Admin",
            user_role="admin",
            description=f"Deleted {deleted_count} proof(s) from {stage} stage",
            metadata={"stage": stage, "count": deleted_count, "proof_ids": proof_ids}
        )
        
        # Remove all matching proofs
        new_proofs = [p for p in existing_proofs if p.get("id") not in proof_ids]
        
        await db.orders.update_one(
            {"id": order_id, "tenant_id": tenant_id},
            {
                "$set": {
                    field: new_proofs,
                    "last_updated_by": "admin",
                    "last_updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {"timeline": timeline_event}
            }
        )
        
        logger.info(f"=== BULK PROOF DELETE COMPLETE === order_id={order_id}, deleted={deleted_count}")
        
        return {"message": f"Deleted {deleted_count} proof(s)", "deleted_count": deleted_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== BULK PROOF DELETE FAILED === order_id={order_id}, error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete proofs: {str(e)}")

@api_router.post("/admin/orders/bulk-update")
async def admin_bulk_update_orders(request_data: dict):
    """
    Update stage and status for multiple orders at once
    Request body: { "order_ids": ["id1", "id2", ...], "stage": "clay", "status": "in_progress" }
    """
    order_ids = request_data.get("order_ids", [])
    new_stage = request_data.get("stage")
    new_status = request_data.get("status")
    
    if not order_ids:
        raise HTTPException(status_code=400, detail="No order IDs provided")
    if not new_stage or not new_status:
        raise HTTPException(status_code=400, detail="Both stage and status are required")
    
    logger.info(f"=== BULK ORDER UPDATE START === count={len(order_ids)}, stage={new_stage}, status={new_status}")
    
    try:
        tenant = await db.tenants.find_one({}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=500, detail="No tenant found")
        
        tenant_id = tenant["id"]
        settings = tenant.get("settings", {})
        workflow_config = settings.get("workflow_config", {})
        
        now = datetime.now(timezone.utc)
        success_count = 0
        failed_ids = []
        
        for order_id in order_ids:
            try:
                order = await db.orders.find_one({
                    "id": order_id,
                    "tenant_id": tenant_id
                }, {"_id": 0})
                
                if not order:
                    failed_ids.append(order_id)
                    continue
                
                old_stage = order.get("stage")
                old_status = order.get(f"{old_stage}_status")
                
                # Create timeline event
                from utils.timeline import create_timeline_event
                timeline_event = create_timeline_event(
                    event_type="bulk_status_change",
                    user_name="Admin",
                    user_role="admin",
                    description=f"Bulk update: {old_stage}/{old_status} → {new_stage}/{new_status}",
                    metadata={
                        "from_stage": old_stage,
                        "from_status": old_status,
                        "to_stage": new_stage,
                        "to_status": new_status
                    }
                )
                
                update_data = {
                    "stage": new_stage,
                    f"{new_stage}_status": new_status,
                    "last_updated_by": "admin",
                    "last_updated_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }
                
                # Set stage entry timestamp if moving to a new stage
                if new_stage != old_stage:
                    update_data[f"{new_stage}_entered_at"] = now.isoformat()
                
                await db.orders.update_one(
                    {"id": order_id, "tenant_id": tenant_id},
                    {
                        "$set": update_data,
                        "$push": {"timeline": timeline_event}
                    }
                )
                
                # Sync tags to Shopify if configured
                try:
                    shopify_order_id = order.get("shopify_order_id")
                    if shopify_order_id:
                        await sync_order_tags_to_shopify(
                            shopify_order_id, new_stage, new_status, tenant, workflow_config
                        )
                except Exception as shopify_err:
                    logger.warning(f"Shopify sync failed for order {order_id}: {shopify_err}")
                
                success_count += 1
                
            except Exception as e:
                logger.error(f"Failed to update order {order_id}: {e}")
                failed_ids.append(order_id)
        
        logger.info(f"=== BULK ORDER UPDATE COMPLETE === success={success_count}, failed={len(failed_ids)}")
        
        return {
            "message": f"Updated {success_count} order(s)",
            "success_count": success_count,
            "failed_count": len(failed_ids),
            "failed_ids": failed_ids
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== BULK ORDER UPDATE FAILED === error={str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update orders: {str(e)}")

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
            "message": "Workflow scheduler completed",
            "orders_processed": processed
        }
    except Exception as e:
        logger.error(f"Manual scheduler run failed: {e}")

# ============== SHOPIFY TAG SYNC ==============

@api_router.post("/admin/orders/{order_id}/sync-shopify-tags")
async def sync_order_shopify_tags(order_id: str):
    """
    Manually sync an order's stage/status tags to Shopify.
    Updates the Shopify order with a tag in "Stage - Status" format.
    """
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if not order.get("shopify_order_id"):
        raise HTTPException(status_code=400, detail="Order does not have a Shopify order ID")
    
    stage = order.get("stage", "clay")
    status = order.get(f"{stage}_status", "pending")
    
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    
    success = await sync_order_tags_to_shopify(
        order["shopify_order_id"],
        stage,
        status,
        tenant,
        workflow_config
    )
    
    if success:
        return {"message": f"Synced tags to Shopify: {stage} - {status}", "success": True}
    else:
        raise HTTPException(status_code=500, detail="Failed to sync tags to Shopify")

@api_router.post("/admin/orders/bulk-sync-shopify-tags")
async def bulk_sync_shopify_tags(request_data: dict = None):
    """
    Bulk sync order tags to Shopify.
    Either provide a list of order_ids or set all_orders=True to sync all orders with Shopify IDs.
    
    Request body:
    - order_ids: List of order IDs to sync (optional)
    - all_orders: Set to true to sync all orders (optional)
    """
    if request_data is None:
        request_data = {}
    
    order_ids = request_data.get("order_ids")
    all_orders = request_data.get("all_orders", False)
    
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    
    query = {"tenant_id": tenant["id"], "shopify_order_id": {"$exists": True, "$ne": None}}
    if order_ids and not all_orders:
        query["id"] = {"$in": order_ids}
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(1000)
    
    success_count = 0
    failed_count = 0
    
    for order in orders:
        stage = order.get("stage", "clay")
        status = order.get(f"{stage}_status", "pending")
        
        try:
            result = await sync_order_tags_to_shopify(
                order["shopify_order_id"],
                stage,
                status,
                tenant,
                workflow_config
            )
            if result:
                success_count += 1
            else:
                failed_count += 1
        except Exception as e:
            logger.error(f"Failed to sync tags for order {order.get('order_number')}: {e}")
            failed_count += 1
    
    return {
        "message": f"Synced {success_count} orders, {failed_count} failed",
        "success": success_count,
        "failed": failed_count,
        "total": len(orders)
    }

@api_router.post("/admin/orders/fix-stages")
async def fix_order_stages(request_data: dict = None):
    """
    Fix orders with incorrect stages:
    1. Convert "Fulfilled" stage to "Shipped" stage
    2. Apply workflow rules to orders with tracking numbers that are stuck in Clay/Paint
    
    This is a one-time migration endpoint to fix historical data.
    """
    if request_data is None:
        request_data = {}
    
    dry_run = request_data.get("dry_run", False)
    
    tenant = await db.tenants.find_one({}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=500, detail="No tenant found")
    
    settings = tenant.get("settings", {})
    workflow_config = settings.get("workflow_config", {})
    
    # Get the correct "shipped" stage from workflow config
    shipped_stage = get_shipped_stage(workflow_config)
    shipped_status = get_first_status_for_shipped_stage(workflow_config)
    
    results = {
        "fulfilled_to_shipped": {"found": 0, "fixed": 0},
        "tracking_workflow_applied": {"found": 0, "fixed": 0},
        "errors": []
    }
    
    # 1. Fix orders with "fulfilled" stage -> convert to "shipped"
    fulfilled_orders = await db.orders.find(
        {"tenant_id": tenant["id"], "stage": "fulfilled"},
        {"_id": 0}
    ).to_list(None)
    
    results["fulfilled_to_shipped"]["found"] = len(fulfilled_orders)
    
    for order in fulfilled_orders:
        try:
            if not dry_run:
                await db.orders.update_one(
                    {"id": order["id"], "tenant_id": tenant["id"]},
                    {
                        "$set": {
                            "stage": shipped_stage,
                            f"{shipped_stage}_status": shipped_status,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "last_updated_by": "stage_fix_migration"
                        },
                        "$push": {
                            "timeline": {
                                "id": str(__import__('uuid').uuid4()),
                                "type": "system",
                                "message": f"Stage corrected from 'fulfilled' to '{shipped_stage}'",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "created_by": "stage_fix_migration"
                            }
                        }
                    }
                )
            results["fulfilled_to_shipped"]["fixed"] += 1
            logger.info(f"Fixed order {order.get('order_number')}: fulfilled -> {shipped_stage}")
        except Exception as e:
            results["errors"].append(f"Order {order.get('order_number')}: {str(e)}")
    
    # 2. Apply workflow rules to orders with tracking numbers stuck in wrong stages
    # Find orders with tracking numbers that are in Clay or Paint stage
    stuck_orders = await db.orders.find(
        {
            "tenant_id": tenant["id"],
            "tracking_number": {"$exists": True, "$nin": [None, ""]},
            "stage": {"$in": ["clay", "paint"]},
            "is_archived": {"$ne": True}
        },
        {"_id": 0}
    ).to_list(None)
    
    results["tracking_workflow_applied"]["found"] = len(stuck_orders)
    
    # Get workflow rules for tracking_added trigger
    rules = workflow_config.get("rules", [])
    tracking_rules = [r for r in rules if r.get("trigger") in ["tracking_number_added", "tracking_added"]]
    
    for order in stuck_orders:
        current_stage = order.get("stage")
        current_status = order.get(f"{current_stage}_status")
        
        # Find matching rule
        matching_rule = None
        for rule in tracking_rules:
            from_stage = rule.get("from_stage")
            from_status = rule.get("from_status")
            if from_stage == current_stage and from_status == current_status:
                matching_rule = rule
                break
        
        if not matching_rule:
            # No matching rule, but order has tracking - move to shipped stage
            logger.info(f"No matching workflow rule for {order.get('order_number')} ({current_stage}/{current_status}), moving to shipped")
            matching_rule = {
                "to_stage": shipped_stage,
                "to_status": shipped_status
            }
        
        to_stage = matching_rule.get("to_stage")
        to_status = matching_rule.get("to_status")
        
        try:
            if not dry_run:
                await db.orders.update_one(
                    {"id": order["id"], "tenant_id": tenant["id"]},
                    {
                        "$set": {
                            "stage": to_stage,
                            f"{to_stage}_status": to_status,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "last_updated_by": "tracking_workflow_migration",
                            f"{to_stage}_entered_at": datetime.now(timezone.utc).isoformat()
                        },
                        "$push": {
                            "timeline": {
                                "id": str(__import__('uuid').uuid4()),
                                "type": "workflow",
                                "message": f"Stage corrected to {to_stage}/{to_status} (has tracking number)",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "created_by": "tracking_workflow_migration",
                                "metadata": {
                                    "trigger": "tracking_migration",
                                    "from_stage": current_stage,
                                    "from_status": current_status,
                                    "to_stage": to_stage,
                                    "to_status": to_status,
                                    "tracking_number": order.get("tracking_number")
                                }
                            }
                        }
                    }
                )
            results["tracking_workflow_applied"]["fixed"] += 1
            logger.info(f"Fixed order {order.get('order_number')}: {current_stage}/{current_status} -> {to_stage}/{to_status} (has tracking)")
        except Exception as e:
            results["errors"].append(f"Order {order.get('order_number')}: {str(e)}")
    
    return {
        "dry_run": dry_run,
        "shipped_stage_used": shipped_stage,
        "shipped_status_used": shipped_status,
        "results": results,
        "message": f"Fixed {results['fulfilled_to_shipped']['fixed']} fulfilled orders and {results['tracking_workflow_applied']['fixed']} orders with tracking" if not dry_run else "Dry run complete - no changes made"
    }

# ============== END SHOPIFY TAG SYNC ==============

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
    
    try:
        # Get first tenant with retry
        async def get_tenant():
            return await db.tenants.find_one({}, {"_id": 0})
        
        tenant = await db_operation_with_retry(get_tenant)
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
        
        # Fetch orders from Shopify
        orders = shopify.Order.find(status='any', limit=250)
        synced_count = 0
        split_count = 0
        updated_tracking_count = 0
        
        # Batch fetch existing order IDs to avoid individual queries (OPTIMIZATION)
        shopify_order_ids = [str(order.id) for order in orders]
        
        async def get_existing_orders():
            existing_cursor = db.orders.find(
                {"tenant_id": tenant_id, "shopify_order_id": {"$in": shopify_order_ids}},
                {"shopify_order_id": 1, "tracking_number": 1, "shopify_fulfillment_status": 1, "_id": 0}
            )
            return await existing_cursor.to_list(length=1000)
        
        existing_orders = await db_operation_with_retry(get_existing_orders)
        existing_orders_map = {doc["shopify_order_id"]: doc for doc in existing_orders}
        existing_shopify_ids = set(existing_orders_map.keys())
        logger.info(f"Shopify sync: Found {len(existing_shopify_ids)} existing orders, processing {len(shopify_order_ids)} from Shopify")
        
        for order in orders:
            shopify_order_id = str(order.id)
            
            # Check if order already exists
            if shopify_order_id in existing_shopify_ids:
                # Update tracking info for existing orders if fulfillment changed
                existing_order = existing_orders_map[shopify_order_id]
                fulfillment_status = order.fulfillment_status if hasattr(order, 'fulfillment_status') else None
                
                # Check if we need to update tracking (order is now fulfilled and we don't have tracking yet)
                if fulfillment_status == "fulfilled" and not existing_order.get("tracking_number"):
                    # Extract tracking from fulfillments
                    tracking_number = None
                    tracking_company = None
                    tracking_url = None
                    fulfilled_at = None
                    
                    if hasattr(order, 'fulfillments') and order.fulfillments:
                        for fulfillment in order.fulfillments:
                            if hasattr(fulfillment, 'tracking_number') and fulfillment.tracking_number:
                                tracking_number = fulfillment.tracking_number
                            if hasattr(fulfillment, 'tracking_company') and fulfillment.tracking_company:
                                tracking_company = fulfillment.tracking_company
                            if hasattr(fulfillment, 'tracking_url') and fulfillment.tracking_url:
                                tracking_url = fulfillment.tracking_url
                            if hasattr(fulfillment, 'created_at') and fulfillment.created_at:
                                fulfilled_at = fulfillment.created_at
                            if hasattr(fulfillment, 'tracking_urls') and fulfillment.tracking_urls:
                                tracking_url = fulfillment.tracking_urls[0] if not tracking_url else tracking_url
                            if tracking_number:
                                break
                    
                    if tracking_number:
                        # Update the existing order with tracking info
                        update_data = {
                            "tracking_number": tracking_number,
                            "tracking_company": tracking_company,
                            "carrier": tracking_company,
                            "tracking_url": tracking_url,
                            "shopify_fulfillment_status": fulfillment_status,
                            "fulfilled_at": fulfilled_at.isoformat() if hasattr(fulfilled_at, 'isoformat') and fulfilled_at else datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                        
                        async def update_tracking():
                            return await db.orders.update_one(
                                {"tenant_id": tenant_id, "shopify_order_id": shopify_order_id},
                                {"$set": update_data}
                            )
                        
                        await db_operation_with_retry(update_tracking)
                        updated_tracking_count += 1
                        logger.info(f"Updated tracking for order {shopify_order_id}: {tracking_number}")
                        
                        # Process tracking_number_added workflow rules
                        # Get the full order data for workflow processing
                        full_order = await db.orders.find_one(
                            {"tenant_id": tenant_id, "shopify_order_id": shopify_order_id},
                            {"_id": 0}
                        )
                        if full_order:
                            await process_tracking_added_workflow(tenant, full_order, update_data)
                
                continue  # Skip to next order
            
            # Use Shopify's created_at date
            shopify_created_at = order.created_at if hasattr(order, 'created_at') else datetime.now(timezone.utc)
            
            # Prepend "20" to order number
            order_number = f"20{order.order_number}"
            
            # Get fulfillment status
            fulfillment_status = order.fulfillment_status if hasattr(order, 'fulfillment_status') else None
            
            # Extract tracking information from fulfillments
            tracking_number = None
            tracking_company = None
            tracking_url = None
            fulfilled_at = None
            
            if hasattr(order, 'fulfillments') and order.fulfillments:
                # Get tracking from the first fulfillment (most orders have one fulfillment)
                for fulfillment in order.fulfillments:
                    if hasattr(fulfillment, 'tracking_number') and fulfillment.tracking_number:
                        tracking_number = fulfillment.tracking_number
                    if hasattr(fulfillment, 'tracking_company') and fulfillment.tracking_company:
                        tracking_company = fulfillment.tracking_company
                    if hasattr(fulfillment, 'tracking_url') and fulfillment.tracking_url:
                        tracking_url = fulfillment.tracking_url
                    if hasattr(fulfillment, 'created_at') and fulfillment.created_at:
                        fulfilled_at = fulfillment.created_at
                    # Also check tracking_urls array (some fulfillments use this)
                    if hasattr(fulfillment, 'tracking_urls') and fulfillment.tracking_urls:
                        tracking_url = fulfillment.tracking_urls[0] if not tracking_url else tracking_url
                    # Break after first fulfillment with tracking info
                    if tracking_number:
                        break
            
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
            
            # Determine the stage for this order
            # If order is fulfilled in Shopify, use the "shipped" stage from workflow config
            if fulfillment_status == "fulfilled":
                order_stage = get_shipped_stage(workflow_config)
                order_status = get_first_status_for_shipped_stage(workflow_config)
            else:
                order_stage = first_stage
                order_status = first_status
            
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
                "stage": order_stage,
                f"{order_stage}_status": order_status,
                # Initialize other stage statuses appropriately
                "clay_status": order_status if order_stage == "clay" else ("completed" if order_stage == "shipped" else "pending"),
                "paint_status": order_status if order_stage == "paint" else ("completed" if order_stage == "shipped" else "pending"),
                "shipped_status": order_status if order_stage == "shipped" else "pending",
                "is_manual_order": False,
                "is_archived": False,
                "shopify_fulfillment_status": fulfillment_status,
                # Tracking information from Shopify
                "tracking_number": tracking_number,
                "tracking_company": tracking_company,
                "carrier": tracking_company,  # Alias for UI compatibility
                "tracking_url": tracking_url,
                "clay_entered_at": shopify_created_at.isoformat() if hasattr(shopify_created_at, 'isoformat') else shopify_created_at,
                "paint_entered_at": fulfilled_at.isoformat() if (fulfillment_status == "fulfilled" and hasattr(fulfilled_at, 'isoformat') and fulfilled_at) else None,
                "shipped_entered_at": fulfilled_at.isoformat() if (fulfillment_status == "fulfilled" and hasattr(fulfilled_at, 'isoformat') and fulfilled_at) else None,
                "fulfilled_at": fulfilled_at.isoformat() if hasattr(fulfilled_at, 'isoformat') and fulfilled_at else None,
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
            
            # Insert with retry
            async def insert_order():
                return await db.orders.insert_one(order_doc)
            
            await db_operation_with_retry(insert_order)
            synced_count += 1
            
            # Check if order should be split by bobblehead count
            if await should_split_order(line_items):
                sub_order_ids = await split_order_by_vendor(db, order_doc, line_items, workflow_config)
                split_count += len(sub_order_ids)
        
        # Build response message
        message_parts = []
        if synced_count > 0:
            message_parts.append(f"Synced {synced_count} new orders")
        if split_count > 0:
            message_parts.append(f"split {split_count} sub-orders")
        if updated_tracking_count > 0:
            message_parts.append(f"updated tracking for {updated_tracking_count} orders")
        
        message = ", ".join(message_parts) if message_parts else "No new orders to sync"
        
        return {
            "message": message,
            "total": len(orders),
            "synced": synced_count,
            "split": split_count,
            "tracking_updated": updated_tracking_count
        }
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Shopify sync error: {error_msg}")
        
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
        elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail="Shopify sync timed out. Please try again in a moment."
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
    import io
    from utils.workflow_rules_engine import get_workflow_engine_from_tenant
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get tenant settings for workflow configuration
    tenant_id = order.get("tenant_id")
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) if tenant_id else None
    
    # Initialize workflow engine with rules
    workflow_engine = get_workflow_engine_from_tenant(tenant.get("settings", {}) if tenant else {})
    
    # Handle additional images if provided - with compression and EXIF orientation fix
    additional_images = []
    if files:
        try:
            from PIL import Image, ExifTags
            
            # Find EXIF orientation key
            orientation_key = None
            for key in ExifTags.TAGS.keys():
                if ExifTags.TAGS[key] == 'Orientation':
                    orientation_key = key
                    break
            
            def fix_exif_orientation(img):
                """Fix image orientation based on EXIF data"""
                try:
                    if orientation_key and hasattr(img, '_getexif') and img._getexif():
                        exif = img._getexif()
                        if exif and orientation_key in exif:
                            orientation = exif[orientation_key]
                            if orientation == 2:
                                return img.transpose(Image.FLIP_LEFT_RIGHT)
                            elif orientation == 3:
                                return img.rotate(180, expand=True)
                            elif orientation == 4:
                                return img.transpose(Image.FLIP_TOP_BOTTOM)
                            elif orientation == 5:
                                return img.rotate(-90, expand=True).transpose(Image.FLIP_LEFT_RIGHT)
                            elif orientation == 6:
                                return img.rotate(-90, expand=True)
                            elif orientation == 7:
                                return img.rotate(90, expand=True).transpose(Image.FLIP_LEFT_RIGHT)
                            elif orientation == 8:
                                return img.rotate(90, expand=True)
                except Exception:
                    pass
                return img
            
            for file in files:
                content = await file.read()
                
                try:
                    img = Image.open(io.BytesIO(content))
                    
                    # Fix EXIF orientation first
                    img = fix_exif_orientation(img)
                    
                    # Convert to RGB if necessary
                    if img.mode in ('RGBA', 'P'):
                        img = img.convert('RGB')
                    
                    # Resize if very large
                    max_dimension = 1200
                    if max(img.size) > max_dimension:
                        ratio = max_dimension / max(img.size)
                        new_size = tuple(int(dim * ratio) for dim in img.size)
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                    
                    # Compress
                    output = io.BytesIO()
                    img.save(output, format='JPEG', quality=70, optimize=True)
                    content = output.getvalue()
                    logger.info(f"Processed customer reference image to {len(content)} bytes")
                except Exception as e:
                    logger.warning(f"Could not process image: {e}, using original")
                
                image_base64 = base64.b64encode(content).decode('utf-8')
                additional_images.append(f"data:image/jpeg;base64,{image_base64}")
        except ImportError:
            # Pillow not available, store images without processing
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
    
    # Create timeline event - don't store full images in timeline, just count
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
            metadata={"stage": stage, "message": message, "image_count": len(additional_images)}
        )
    
    try:
        await db.orders.update_one(
            {"id": order_id}, 
            {
                "$set": update_data,
                "$push": {"timeline": timeline_event}
            }
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to save customer response for order {order_id}: {error_msg}")
        
        # Check if it's a document size issue
        if "BSONObj size" in error_msg or "object to insert too large" in error_msg or "too large" in error_msg.lower():
            raise HTTPException(
                status_code=413, 
                detail="The reference image is too large. Please try a smaller image (under 2MB)."
            )
        raise HTTPException(status_code=500, detail=f"Failed to save response: {error_msg}")
    
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
    
    # Get email template settings
    email_templates = tenant.get("settings", {}).get("email_templates", {})
    template_id = f"reminder_{stage}"
    template_settings = email_templates.get(template_id, {})
    
    # Check if template is enabled (default to True)
    if not template_settings.get("enabled", True):
        raise HTTPException(status_code=400, detail="Reminder email template is disabled")
    
    # Get company info
    company_name = tenant.get("name", "AllBobbleheads.com")
    company_email = tenant.get("settings", {}).get("smtp_from_email") or tenant.get("smtp_from_email", "orders@allbobbleheads.com")
    portal_url = f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/customer"
    
    # Build subject and body from template or defaults
    default_subject = f"Reminder: Please Review Your {stage.capitalize()} Proofs - Order #{order['order_number']}"
    default_body = f"""
    <html>
    <head><style>
    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
    .header {{ background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
    .content {{ background: #ffffff; padding: 30px 20px; border: 1px solid #e0e0e0; }}
    .info-box {{ background: #e3f2fd; padding: 20px; border-left: 4px solid #2196F3; margin: 20px 0; }}
    .button {{ background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }}
    .footer {{ text-align: center; padding: 20px; color: #888; font-size: 12px; background: #f5f5f5; }}
    </style></head>
    <body>
    <div class="container">
    <div class="header"><div style="font-size: 48px;">🔔</div><h1>Proof Review Reminder</h1></div>
    <div class="content">
    <p>Hi {{customer_name}},</p>
    <p>This is a friendly reminder that your bobblehead {stage} proofs are ready and waiting for your review!</p>
    <div class="info-box">
    <p><strong>Order Number:</strong> #{{order_number}}</p>
    <p><strong>Stage:</strong> {stage.capitalize()}</p>
    <p><strong>Proofs Available:</strong> {{num_images}} image(s)</p>
    </div>
    <p>Please review your proofs and let us know if you'd like to:</p>
    <ul>
    <li>✓ Approve the {stage} stage</li>
    <li>📝 Request any changes</li>
    </ul>
    <p style="text-align: center;">
    <a href="{{portal_url}}" class="button">Review Your Proofs</a>
    </p>
    <p style="color: #666; font-size: 14px;">To view your order, visit the customer portal and enter your email and order number.</p>
    </div>
    <div class="footer"><p>{{company_name}} | {{company_email}}</p></div>
    </div>
    </body>
    </html>
    """
    
    subject = template_settings.get("subject", default_subject)
    html_content = template_settings.get("body", default_body)
    
    # Replace placeholders
    replacements = {
        "{order_number}": str(order['order_number']),
        "{customer_name}": order.get('customer_name', 'Customer'),
        "{num_images}": str(len(proofs)),
        "{portal_url}": portal_url,
        "{company_name}": company_name,
        "{company_email}": company_email,
        "{stage}": stage.capitalize(),
        "{{order_number}}": str(order['order_number']),
        "{{customer_name}}": order.get('customer_name', 'Customer'),
        "{{num_images}}": str(len(proofs)),
        "{{portal_url}}": portal_url,
        "{{company_name}}": company_name,
        "{{company_email}}": company_email,
        "{{stage}}": stage.capitalize(),
        "#{order_number}": f"#{order['order_number']}"
    }
    
    for key, value in replacements.items():
        subject = subject.replace(key, value)
        html_content = html_content.replace(key, value)
    
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
# Note: Main health check is at /api/health with detailed status

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
