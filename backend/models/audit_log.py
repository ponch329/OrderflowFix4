from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid

class AuditLog(BaseModel):
    """Audit log for tracking configuration changes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    user_email: str
    action: str  # "workflow_updated", "stage_added", "stage_deleted", etc.
    section: str  # "stages", "statuses", "rules", "branding", etc.
    changes: dict  # Before/after values
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None

class AuditLogCreate(BaseModel):
    """Schema for creating audit log entry"""
    action: str
    section: str
    changes: dict
    ip_address: Optional[str] = None
