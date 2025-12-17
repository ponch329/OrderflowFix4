"""
Order management routes with tenant isolation
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Optional
import os
import uuid
import base64
import zipfile
import io
from datetime import datetime, timezone

from models.order import Order, ManualOrderCreate, OrderNoteCreate
from models.user import Permission
from middleware.auth import AuthContext, get_current_user, require_permissions

router = APIRouter(prefix="/orders", tags=["Orders"])

def get_db():
    """Dependency to get database connection"""
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    return db

@router.get("/")
async def get_orders(
    page: int = 1,
    limit: int = 50,
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_ORDERS)),
    db = Depends(get_db)
):
    """
    Get paginated orders for the current tenant
    Requires: VIEW_ORDERS permission
    
    Query params:
    - page: Page number (default: 1)
    - limit: Orders per page (default: 50, max: 100)
    """
    # Validate pagination params
    page = max(1, page)
    limit = min(max(1, limit), 100)  # Cap at 100 per page
    skip = (page - 1) * limit
    
    # Build query based on user role
    query = {"tenant_id": auth.tenant_id}
    
    # Manufacturers may have restricted view in the future
    # For now, all users with VIEW_ORDERS can see all orders
    
    # Get total count
    total_count = await db.orders.count_documents(query)
    
    # Get paginated orders
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for order in orders:
        # Convert datetime strings to datetime objects
        for field in ['created_at', 'updated_at', 'clay_entered_at', 'paint_entered_at', 'fulfilled_at', 'canceled_at']:
            if field in order and isinstance(order[field], str):
                order[field] = datetime.fromisoformat(order[field])
    
    total_pages = (total_count + limit - 1) // limit  # Ceiling division
    
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

@router.post("/", response_model=Order)
async def create_order(
    order_data: ManualOrderCreate,
    auth: AuthContext = Depends(require_permissions(Permission.CREATE_ORDERS)),
    db = Depends(get_db)
):
    """
    Create a manual order
    Requires: CREATE_ORDERS permission
    Uses workflow config from database for default stage/status values.
    """
    # Check if order number already exists in this tenant
    existing = await db.orders.find_one({
        "tenant_id": auth.tenant_id,
        "order_number": order_data.order_number
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Order #{order_data.order_number} already exists")
    
    # Get workflow config from tenant settings for default status values
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    workflow_config = tenant.get("settings", {}).get("workflow_config", {}) if tenant else {}
    stages = workflow_config.get("stages", [])
    
    # Get first status for the selected stage from workflow config
    def get_first_status_for_stage_local(stage_id):
        for stage in stages:
            if stage.get("id") == stage_id:
                statuses = stage.get("statuses", [])
                if statuses:
                    return statuses[0].get("id", "pending")
        # Fallback based on stage
        if stage_id == "clay":
            return "sculpting"
        elif stage_id == "paint":
            return "painting"
        return "pending"
    
    now = datetime.now(timezone.utc)
    initial_status = get_first_status_for_stage_local(order_data.stage)
    
    new_order = {
        "id": str(uuid.uuid4()),
        "tenant_id": auth.tenant_id,
        "shopify_order_id": None,
        "order_number": order_data.order_number,
        "customer_email": order_data.customer_email,
        "customer_name": order_data.customer_name,
        "item_vendor": order_data.item_vendor,
        "parent_order_id": None,
        "stage": order_data.stage,
        # Set status dynamically based on workflow config
        f"{order_data.stage}_status": initial_status,
        "clay_status": initial_status if order_data.stage == "clay" else "pending",
        "paint_status": initial_status if order_data.stage == "paint" else "pending",
        "is_manual_order": True,
        "is_archived": False,
        "shopify_fulfillment_status": None,
        "clay_entered_at": now.isoformat() if order_data.stage == "clay" else None,
        "paint_entered_at": now.isoformat() if order_data.stage == "paint" else None,
        "fulfilled_at": None,
        "canceled_at": None,
        "clay_proofs": [],
        "paint_proofs": [],
        "clay_approval": None,
        "paint_approval": None,
        "notes": [],
        "last_updated_by": auth.user_id,
        "last_updated_at": now.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.orders.insert_one(new_order)
    
    # Log to Google Sheets if configured
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        auth.tenant_id,
        order_data.order_number,
        "Manual Order Created",
        f"Created by {auth.user.full_name} ({auth.user.role.value})",
        stage=order_data.stage,
        status=initial_status
    )
    
    return Order(**new_order)

@router.post("/{order_id}/notes", response_model=Order)
async def add_note_to_order(
    order_id: str,
    note_data: OrderNoteCreate,
    auth: AuthContext = Depends(require_permissions(Permission.ADD_NOTES)),
    db = Depends(get_db)
):
    """
    Add a note to an order
    Requires: ADD_NOTES permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    note = {
        "id": str(uuid.uuid4()),
        "user_id": auth.user_id,
        "user_name": auth.user.full_name,
        "user_role": auth.role.value,
        "content": note_data.content,
        "visible_to_customer": note_data.visible_to_customer,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$push": {"notes": note},
            "$set": {
                "last_updated_by": auth.user_id,
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Fetch updated order
    updated_order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    return Order(**updated_order)

@router.post("/{order_id}/proofs")
async def upload_proofs(
    order_id: str,
    stage: str = Form(...),
    revision_note: str = Form(None),
    files: List[UploadFile] = File(...),
    auth: AuthContext = Depends(require_permissions(Permission.UPLOAD_PROOFS)),
    db = Depends(get_db)
):
    """
    Upload proof images for an order (supports zip files and revision tracking)
    Requires: UPLOAD_PROOFS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Determine the current round number
    existing_proofs = order.get(f"{stage}_proofs", [])
    current_round = 1
    if existing_proofs:
        # Get the highest round number and add 1
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
                            "id": str(uuid.uuid4()),
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
                "id": str(uuid.uuid4()),
                "url": f"data:image/jpeg;base64,{image_base64}",
                "filename": file.filename,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "round": current_round,
                "revision_note": revision_note
            }
            uploaded_proofs.append(proof)
    
    # Get tenant settings for workflow configuration
    from utils.workflow_rules_engine import get_workflow_engine_from_tenant
    tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
    workflow_engine = get_workflow_engine_from_tenant(tenant.get("settings", {}) if tenant else {})
    
    # Use workflow engine to determine status after upload
    new_status = workflow_engine.get_status_after_upload(stage)
    
    # Create timeline event for proof upload
    from utils.timeline import create_timeline_event
    note_suffix = f" - {revision_note}" if revision_note else ""
    timeline_event = create_timeline_event(
        event_type="proof_upload",
        user_name=auth.user.full_name,
        user_role=auth.role.value,
        description=f"Uploaded {len(uploaded_proofs)} proof(s) for {stage} stage (Round {current_round}){note_suffix}",
        metadata={
            "stage": stage,
            "count": len(uploaded_proofs),
            "round": current_round,
            "revision_note": revision_note
        }
    )
    
    # Update order with proofs and change status based on workflow config
    field = f"{stage}_proofs"
    status_field = f"{stage}_status"
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$push": {
                field: {"$each": uploaded_proofs},
                "timeline": timeline_event
            },
            "$set": {
                status_field: new_status,
                "last_updated_by": auth.user_id,
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
            auth.tenant_id,
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
        auth.tenant_id,
        order['order_number'],
        f"Proofs Uploaded - {stage} (Round {current_round})",
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

@router.delete("/{order_id}/proofs/{proof_id}")
async def delete_proof(
    order_id: str,
    proof_id: str,
    stage: str,
    auth: AuthContext = Depends(require_permissions(Permission.DELETE_PROOFS)),
    db = Depends(get_db)
):
    """
    Delete a specific proof image from an order
    Requires: DELETE_PROOFS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if stage not in ["clay", "paint"]:
        raise HTTPException(status_code=400, detail="Invalid stage. Must be 'clay' or 'paint'")
    
    proofs_field = f"{stage}_proofs"
    proofs = order.get(proofs_field, [])
    
    updated_proofs = [proof for proof in proofs if proof.get('id') != proof_id]
    
    if len(updated_proofs) == len(proofs):
        raise HTTPException(status_code=404, detail="Proof not found")
    
    # Create timeline event for proof deletion
    from utils.timeline import create_timeline_event
    timeline_event = create_timeline_event(
        event_type="proof_deleted",
        user_name=auth.user.full_name,
        user_role=auth.role.value,
        description=f"Deleted a proof from {stage} stage",
        metadata={"stage": stage, "proof_id": proof_id}
    )
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$set": {
                proofs_field: updated_proofs,
                "last_updated_by": auth.user_id,
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"timeline": timeline_event}
        }
    )
    
    # Log to sheets
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        auth.tenant_id,
        order['order_number'],
        f"Proof Deleted - {stage.capitalize()}",
        f"Removed 1 image. {len(updated_proofs)} remaining",
        stage=order.get('stage', ''),
        status=order.get(f"{stage}_status", '')
    )
    
    return {
        "message": "Proof deleted successfully",
        "remaining_proofs": len(updated_proofs)
    }

@router.patch("/{order_id}/archive")
async def toggle_archive_order(
    order_id: str,
    archive: bool = True,
    auth: AuthContext = Depends(require_permissions(Permission.ARCHIVE_ORDERS)),
    db = Depends(get_db)
):
    """
    Archive or unarchive an order
    Requires: ARCHIVE_ORDERS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$set": {
                "is_archived": archive,
                "last_updated_by": auth.user_id,
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    action = "Archived" if archive else "Unarchived"
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        auth.tenant_id,
        order['order_number'],
        f"Order {action}",
        f"Order {action.lower()} by {auth.user.full_name}",
        stage=order.get('stage', ''),
        status=order.get('clay_status', '')
    )
    
    return {"message": f"Order {action.lower()} successfully", "archived": archive}

@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str,
    stage: Optional[str] = None,
    clay_status: Optional[str] = None,
    paint_status: Optional[str] = None,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Manually update order stage and/or status
    Requires: EDIT_ORDERS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    now = datetime.now(timezone.utc)
    update_data = {
        "last_updated_by": auth.user_id,
        "last_updated_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    # Track stage changes with timestamps
    if stage and stage != order.get('stage'):
        update_data["stage"] = stage
        # Handle archived stage
        if stage == "archived":
            update_data["is_archived"] = True
        else:
            update_data["is_archived"] = False
            
        if stage == "clay":
            update_data["clay_entered_at"] = now.isoformat()
        elif stage == "paint":
            update_data["paint_entered_at"] = now.isoformat()
        elif stage == "fulfilled":
            update_data["fulfilled_at"] = now.isoformat()
        elif stage == "canceled":
            update_data["canceled_at"] = now.isoformat()
    
    if clay_status:
        update_data["clay_status"] = clay_status
    
    if paint_status:
        update_data["paint_status"] = paint_status
    
    # Add timeline events for changes
    from utils.timeline import create_timeline_event
    timeline_events = []
    
    if stage and stage != order.get('stage'):
        timeline_event = create_timeline_event(
            event_type="stage_change",
            user_name=auth.user.full_name,
            user_role=auth.role.value,
            description=f"Moved order from {order.get('stage', 'N/A')} to {stage} stage",
            metadata={"old_stage": order.get('stage'), "new_stage": stage}
        )
        timeline_events.append(timeline_event)
    
    if clay_status and clay_status != order.get('clay_status'):
        timeline_event = create_timeline_event(
            event_type="status_change",
            user_name=auth.user.full_name,
            user_role=auth.role.value,
            description=f"Changed clay status from {order.get('clay_status', 'N/A')} to {clay_status}",
            metadata={"stage": "clay", "old_status": order.get('clay_status'), "new_status": clay_status}
        )
        timeline_events.append(timeline_event)
    
    if paint_status and paint_status != order.get('paint_status'):
        timeline_event = create_timeline_event(
            event_type="status_change",
            user_name=auth.user.full_name,
            user_role=auth.role.value,
            description=f"Changed paint status from {order.get('paint_status', 'N/A')} to {paint_status}",
            metadata={"stage": "paint", "old_status": order.get('paint_status'), "new_status": paint_status}
        )
        timeline_events.append(timeline_event)
    
    # Update order with timeline events
    update_ops = {"$set": update_data}
    if timeline_events:
        update_ops["$push"] = {"timeline": {"$each": timeline_events}}
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        update_ops
    )
    
    # Log to sheets
    changes = []
    if stage:
        changes.append(f"Stage: {stage}")
    if clay_status:
        changes.append(f"Clay Status: {clay_status}")
    if paint_status:
        changes.append(f"Paint Status: {paint_status}")
    
    updated_order = await db.orders.find_one({"id": order_id, "tenant_id": auth.tenant_id}, {"_id": 0})
    
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        auth.tenant_id,
        order['order_number'],
        "Manual Status Update",
        ", ".join(changes),
        stage=updated_order.get('stage', ''),
        status=updated_order.get('clay_status', '')
    )
    
    return {"message": "Status updated successfully", "updates": update_data}

@router.get("/{order_id}")
async def get_order_details(
    order_id: str,
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_ORDERS)),
    db = Depends(get_db)
):
    """
    Get detailed order information
    Requires: VIEW_ORDERS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return order

@router.patch("/{order_id}/info")
async def update_order_info(
    order_id: str,
    order_number: Optional[str] = None,
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Update basic order information
    Requires: EDIT_ORDERS permission
    """
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    update_data = {
        "last_updated_by": auth.user_id,
        "last_updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    changed_fields = []
    if order_number and order_number != order.get('order_number'):
        update_data["order_number"] = order_number
        changed_fields.append(f"order number to {order_number}")
    if customer_name and customer_name != order.get('customer_name'):
        update_data["customer_name"] = customer_name
        changed_fields.append(f"customer name to {customer_name}")
    if customer_email and customer_email != order.get('customer_email'):
        update_data["customer_email"] = customer_email
        changed_fields.append(f"customer email to {customer_email}")
    
    # Create timeline event if changes were made
    update_ops = {"$set": update_data}
    if changed_fields:
        from utils.timeline import create_timeline_event
        timeline_event = create_timeline_event(
            event_type="order_edited",
            user_name=auth.user.full_name,
            user_role=auth.role.value,
            description=f"Edited order details: {', '.join(changed_fields)}",
            metadata={"fields": changed_fields}
        )
        update_ops["$push"] = {"timeline": timeline_event}
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        update_ops
    )
    
    return {"message": "Order info updated successfully"}

@router.post("/{order_id}/request-changes")
async def admin_request_changes(
    order_id: str,
    message: str,
    stage: str,
    files: List[UploadFile] = File(None),
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Admin requests changes (same as customer would)
    Requires: EDIT_ORDERS permission
    """
    import base64
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
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
        "id": str(uuid.uuid4()),
        "status": "changes_requested",
        "message": message,
        "images": additional_images,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update order status
    field = f"{stage}_approval"
    status_field = f"{stage}_status"
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$set": {
                field: approval,
                status_field: "changes_requested",
                "last_updated_by": auth.user_id,
                "last_updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Log to sheets
    from utils.helpers import log_to_sheets
    await log_to_sheets(
        db,
        auth.tenant_id,
        order['order_number'],
        f"Changes Requested - {stage.capitalize()}",
        message,
        stage=order.get('stage', ''),
        status="changes_requested",
        emailed_customer="No"
    )
    
    return {"message": "Changes requested", "approval": approval}


# ============================================
# ADMIN EDITING ENDPOINTS
# ============================================

@router.patch("/{order_id}/approval/{stage}")
async def edit_customer_approval(
    order_id: str,
    stage: str,
    approval_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Edit customer approval/change request
    Requires: EDIT_ORDERS permission
    """
    if stage not in ["clay", "paint"]:
        raise HTTPException(status_code=400, detail="Invalid stage")
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    approval_field = f"{stage}_approval"
    if not order.get(approval_field):
        raise HTTPException(status_code=404, detail=f"No {stage} approval found")
    
    # Update the approval message and images
    update_dict = {}
    if "message" in approval_data:
        update_dict[f"{approval_field}.message"] = approval_data["message"]
    if "images" in approval_data:
        update_dict[f"{approval_field}.images"] = approval_data["images"]
    
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["last_updated_by"] = auth.user_id
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {"$set": update_dict}
    )
    
    return {"message": f"{stage.capitalize()} approval updated successfully"}

@router.delete("/{order_id}/approval/{stage}/image")
async def delete_approval_image(
    order_id: str,
    stage: str,
    image_url: str,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Delete an image from customer approval/change request
    Requires: EDIT_ORDERS permission
    """
    if stage not in ["clay", "paint"]:
        raise HTTPException(status_code=400, detail="Invalid stage")
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    approval_field = f"{stage}_approval"
    if not order.get(approval_field):
        raise HTTPException(status_code=404, detail=f"No {stage} approval found")
    
    # Remove the image from the images array
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$pull": {f"{approval_field}.images": image_url},
            "$set": {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_updated_by": auth.user_id
            }
        }
    )
    
    return {"message": "Image deleted successfully"}

@router.delete("/{order_id}/proof/{proof_id}")
async def delete_proof_image(
    order_id: str,
    proof_id: str,
    stage: str,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Delete a proof image
    Requires: EDIT_ORDERS permission
    """
    if stage not in ["clay", "paint"]:
        raise HTTPException(status_code=400, detail="Invalid stage")
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Remove the proof from the proofs array
    proof_field = f"{stage}_proofs"
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$pull": {proof_field: {"id": proof_id}},
            "$set": {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_updated_by": auth.user_id
            }
        }
    )
    
    return {"message": "Proof image deleted successfully"}

@router.patch("/{order_id}/proof/{proof_id}/note")
async def edit_proof_note(
    order_id: str,
    proof_id: str,
    stage: str,
    note_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Edit revision note for a specific proof
    Requires: EDIT_ORDERS permission
    """
    if stage not in ["clay", "paint"]:
        raise HTTPException(status_code=400, detail="Invalid stage")
    
    order = await db.orders.find_one({
        "id": order_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update the revision note for the specific proof
    proof_field = f"{stage}_proofs"
    proofs = order.get(proof_field, [])
    
    proof_found = False
    for i, proof in enumerate(proofs):
        if proof.get("id") == proof_id:
            proofs[i]["revision_note"] = note_data.get("revision_note", "")
            proof_found = True
            break
    
    if not proof_found:
        raise HTTPException(status_code=404, detail="Proof not found")
    
    await db.orders.update_one(
        {"id": order_id, "tenant_id": auth.tenant_id},
        {
            "$set": {
                proof_field: proofs,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "last_updated_by": auth.user_id
            }
        }
    )
    
    return {"message": "Proof note updated successfully"}


@router.post("/bulk-reminder-emails")
async def send_bulk_reminder_emails(
    request_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Send reminder emails to customers for selected orders
    Requires: EDIT_ORDERS permission
    """
    try:
        order_ids = request_data.get("order_ids", [])
        
        if not order_ids:
            raise HTTPException(status_code=400, detail="No orders selected")
        
        # Fetch selected orders
        orders = await db.orders.find(
            {"id": {"$in": order_ids}, "tenant_id": auth.tenant_id},
            {"_id": 0}
        ).to_list(100)
        
        if not orders:
            raise HTTPException(status_code=404, detail="No orders found")
        
        # Get tenant settings for email configuration
        tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Import email helper
        from utils.helpers import send_email
        
        sent_count = 0
        failed_count = 0
        
        for order in orders:
            try:
                customer_email = order.get("customer_email")
                if not customer_email:
                    failed_count += 1
                    continue
                
                # Get current stage and status
                stage = order.get("stage", "clay")
                status = order.get(f"{stage}_status", "pending")
                
                # Only send reminders for orders awaiting customer action
                if status not in ["feedback_needed", "changes_requested"]:
                    failed_count += 1
                    continue
                
                # Build email content
                subject = f"Reminder: Please Review Your Proof - Order {order.get('order_number')}"
                
                branding = tenant.get("settings", {}).get("branding", {})
                company_name = tenant.get("name", "Our Company")
                primary_color = branding.get("primary_color", "#2563eb")
                
                html_body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: {primary_color};">{company_name}</h2>
                        <h3>Reminder: Your Proof is Ready for Review</h3>
                        <p>Hello {order.get('customer_name', 'Customer')},</p>
                        <p>This is a friendly reminder that your proof for <strong>Order #{order.get('order_number')}</strong> is awaiting your review and approval.</p>
                        <p><strong>Current Status:</strong> {status.replace('_', ' ').title()}</p>
                        <p>Please take a moment to review and provide your feedback:</p>
                        <p style="text-align: center; margin: 30px 0;">
                            <a href="{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/order/{order.get('id')}" 
                               style="background-color: {primary_color}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Your Proof
                            </a>
                        </p>
                        <p>If you have any questions, please don't hesitate to reach out to us.</p>
                        <p>Best regards,<br>{company_name}</p>
                    </div>
                </body>
                </html>
                """
                
                # Send email
                await send_email(
                    to_email=customer_email,
                    subject=subject,
                    body=html_body,
                    tenant_id=auth.tenant_id
                )
                
                sent_count += 1
                
            except Exception as e:
                print(f"Failed to send email for order {order.get('id')}: {str(e)}")
                failed_count += 1
                continue
        
        return {
            "message": f"Reminder emails sent to {sent_count} customer(s)",
            "sent": sent_count,
            "failed": failed_count,
            "total": len(orders)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending bulk reminder emails: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send reminder emails")

@router.post("/bulk-archive")
async def bulk_archive_orders(
    request_data: dict,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_ORDERS)),
    db = Depends(get_db)
):
    """
    Archive or unarchive multiple orders
    Requires: EDIT_ORDERS permission
    """
    try:
        order_ids = request_data.get("order_ids", [])
        archived = request_data.get("archived", True)
        
        if not order_ids:
            raise HTTPException(status_code=400, detail="No orders selected")
        
        # Update orders
        result = await db.orders.update_many(
            {"id": {"$in": order_ids}, "tenant_id": auth.tenant_id},
            {"$set": {"archived": archived, "updated_at": datetime.now(timezone.utc)}}
        )
        
        return {
            "message": f"{'Archived' if archived else 'Unarchived'} {result.modified_count} order(s)",
            "modified_count": result.modified_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to archive orders: {str(e)}")

        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reminder emails: {str(e)}")

