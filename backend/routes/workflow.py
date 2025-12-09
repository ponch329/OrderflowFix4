from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Dict, Any, List
from datetime import datetime, timezone
from models.audit_log import AuditLog, AuditLogCreate
from models.user import Permission
from middleware.auth import AuthContext, require_permissions
from motor.motor_asyncio import AsyncIOMotorClient
import os

router = APIRouter(prefix="/workflow", tags=["workflow"])

def get_db():
    """Dependency to get database connection"""
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    return db

@router.post("/validate")
async def validate_workflow_config(
    config: Dict[str, Any],
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_SETTINGS)),
    db = Depends(get_db)
):
    """
    Validate workflow configuration for issues
    Returns list of warnings/errors
    """
    issues = []
    
    # Extract configuration
    stages = config.get("stages", [])
    stage_transitions = config.get("stage_transitions", {})
    stage_labels = config.get("stage_labels", {})
    
    # Check for circular references in stage transitions
    visited = set()
    for start_stage in stages:
        current = start_stage
        path = []
        while current and current not in visited:
            if current in path:
                issues.append({
                    "type": "error",
                    "message": f"Circular reference detected in stage transitions: {' → '.join(path + [current])}",
                    "field": "stage_transitions"
                })
                break
            path.append(current)
            current = stage_transitions.get(current)
        visited.update(path)
    
    # Check for orphaned stage labels
    for stage_key in stage_labels:
        if stage_key not in stages:
            issues.append({
                "type": "warning",
                "message": f"Label exists for undefined stage: {stage_key}",
                "field": "stage_labels"
            })
    
    # Check for missing stage labels
    for stage in stages:
        if stage not in stage_labels or not stage_labels[stage]:
            issues.append({
                "type": "warning",
                "message": f"No label defined for stage: {stage}",
                "field": "stage_labels"
            })
    
    # Check for invalid next_stage references
    for stage, next_stage in stage_transitions.items():
        if next_stage and next_stage not in stages:
            issues.append({
                "type": "error",
                "message": f"Stage '{stage}' transitions to non-existent stage '{next_stage}'",
                "field": "stage_transitions"
            })
    
    return {
        "valid": len([i for i in issues if i["type"] == "error"]) == 0,
        "issues": issues
    }

@router.get("/stages-in-use")
async def get_stages_in_use(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Get list of stages currently used by active orders
    This prevents deletion of stages with orders
    """
    try:
        # Get all orders for this tenant
        orders = await db.orders.find({"tenant_id": auth.tenant_id}, {"stage": 1, "_id": 0}).to_list(10000)
        
        # Count orders per stage
        stages_in_use = {}
        for order in orders:
            stage = order.get("stage")
            if stage:
                stages_in_use[stage] = stages_in_use.get(stage, 0) + 1
        
        return {
            "stages_in_use": stages_in_use,
            "total_orders": len(orders)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export")
async def export_workflow_config(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Export current workflow configuration as JSON
    """
    try:
        tenant = await db.tenants.find_one({"id": auth.tenant_id}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        workflow_config = tenant.get("settings", {}).get("workflow", {})
        
        return {
            "config": workflow_config,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "tenant_id": auth.tenant_id,
            "tenant_name": tenant.get("name")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import")
async def import_workflow_config(
    config_data: Dict[str, Any],
    request: Request,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_SETTINGS)),
    db = Depends(get_db)
):
    """
    Import workflow configuration from JSON
    """
    try:
        # Validate the imported config first
        workflow_config = config_data.get("config", {})
        
        # Update tenant settings
        result = await db.tenants.update_one(
            {"id": auth.tenant_id},
            {
                "$set": {
                    "settings.workflow": workflow_config,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Log the import action
        audit_entry = AuditLog(
            tenant_id=auth.tenant_id,
            user_id=auth.user.id,
            user_email=auth.user.email,
            action="workflow_imported",
            section="workflow",
            changes={"imported_from": config_data.get("tenant_name", "unknown")},
            ip_address=request.client.host if request.client else None
        )
        await db.audit_logs.insert_one(audit_entry.model_dump())
        
        return {"message": "Workflow configuration imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 50,
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_SETTINGS)),
    db = Depends(get_db)
):
    """
    Get audit logs for workflow changes
    """
    try:
        logs = await db.audit_logs.find(
            {"tenant_id": auth.tenant_id, "section": {"$in": ["workflow", "stages", "statuses", "rules"]}},
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit).to_list(limit)
        
        return {"logs": logs, "total": len(logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/log-change")
async def log_workflow_change(
    log_data: AuditLogCreate,
    request: Request,
    auth: AuthContext = Depends(require_permissions(Permission.EDIT_SETTINGS)),
    db = Depends(get_db)
):
    """
    Log a workflow configuration change
    """
    try:
        audit_entry = AuditLog(
            tenant_id=auth.tenant_id,
            user_id=auth.user.id,
            user_email=auth.user.email,
            action=log_data.action,
            section=log_data.section,
            changes=log_data.changes,
            ip_address=log_data.ip_address or (request.client.host if request.client else None)
        )
        
        await db.audit_logs.insert_one(audit_entry.model_dump())
        
        return {"message": "Change logged successfully", "log_id": audit_entry.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
