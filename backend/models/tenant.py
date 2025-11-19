from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import uuid

class WorkflowConfig(BaseModel):
    """Configurable workflow settings for order stages and statuses"""
    model_config = ConfigDict(extra="ignore")
    
    # Stage Configuration
    stages: List[str] = Field(default_factory=lambda: ["clay", "paint", "shipped"])
    stage_labels: Dict[str, str] = Field(default_factory=lambda: {
        "clay": "Clay Stage",
        "paint": "Paint Stage",
        "shipped": "Shipped"
    })
    
    # Status Labels (for display)
    status_labels: Dict[str, str] = Field(default_factory=lambda: {
        "sculpting": "In Progress",
        "feedback_needed": "Customer Feedback Needed",
        "changes_requested": "Changes Requested",
        "approved": "Approved",
        "pending": "Not Started"
    })
    
    # Workflow Behavior
    auto_advance_on_approval: bool = True
    require_admin_confirmation_for_stage_change: bool = False
    status_after_upload: str = "feedback_needed"
    
    # Stage Transition Rules
    stage_transitions: Dict[str, str] = Field(default_factory=lambda: {
        "clay": "paint",
        "paint": "shipped"
    })
    
    # Which stages require customer approval
    stage_requires_customer_approval: Dict[str, bool] = Field(default_factory=lambda: {
        "clay": True,
        "paint": True
    })
    
    # Email Notifications
    notify_customer_on_upload: bool = True
    notify_admin_on_customer_response: bool = True

class TenantSettings(BaseModel):
    """Tenant-specific settings for branding and customization"""
    model_config = ConfigDict(extra="ignore")
    
    # Branding
    logo_url: Optional[str] = None
    primary_color: str = "#2196F3"
    secondary_color: str = "#9C27B0"
    font_family: str = "Arial, sans-serif"
    font_size_base: str = "16px"
    
    # Email settings
    bcc_email: Optional[str] = None
    email_templates_enabled: bool = True
    
    # Order visibility for manufacturers
    manufacturer_visible_fields: list[str] = Field(
        default_factory=lambda: [
            "order_number",
            "customer_name",
            "stage",
            "clay_status",
            "paint_status",
            "clay_proofs",
            "paint_proofs"
        ]
    )
    
    # Manufacturer permissions
    manufacturer_can_change_status: bool = False
    manufacturer_can_add_notes: bool = True
    notes_visible_to_customer: bool = False
    
    # Workflow configuration
    workflow: WorkflowConfig = Field(default_factory=WorkflowConfig)

class Tenant(BaseModel):
    """Tenant model for multi-tenancy"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Business name
    subdomain: Optional[str] = None  # For future multi-domain support
    
    # Shopify configuration (tenant-specific)
    shopify_shop_name: Optional[str] = None
    shopify_api_key: Optional[str] = None
    shopify_api_secret: Optional[str] = None
    shopify_access_token: Optional[str] = None
    
    # Google Sheets configuration (tenant-specific)
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    spreadsheet_id: Optional[str] = None
    
    # SMTP configuration (tenant-specific)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    
    # Settings
    settings: TenantSettings = Field(default_factory=TenantSettings)
    
    # Metadata
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TenantCreate(BaseModel):
    """Schema for creating a new tenant"""
    name: str
    shopify_shop_name: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_from_email: Optional[str] = None

class TenantUpdate(BaseModel):
    """Schema for updating tenant information"""
    name: Optional[str] = None
    shopify_shop_name: Optional[str] = None
    shopify_api_key: Optional[str] = None
    shopify_api_secret: Optional[str] = None
    shopify_access_token: Optional[str] = None
    settings: Optional[TenantSettings] = None
