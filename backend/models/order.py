from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

class ProofImage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    filename: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    round: int = 1  # Revision round number
    revision_note: Optional[str] = None  # Note about this revision

class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str  # 'approved' or 'changes_requested'
    message: Optional[str] = None
    images: List[str] = []  # URLs of additional images
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderNote(BaseModel):
    """Note attached to an order"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str  # ID of user who created the note
    user_name: str  # Name of user for display
    user_role: str  # Role of user (for display)
    content: str
    visible_to_customer: bool = False  # Admin can control visibility
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str  # Reference to tenant
    
    # Order info
    shopify_order_id: Optional[str] = None  # None for manual orders
    order_number: str
    customer_email: Optional[str] = ""
    customer_name: Optional[str] = ""
    
    # Item vendor info (for splitting orders)
    item_vendor: Optional[str] = None
    parent_order_id: Optional[str] = None  # For sub-orders (e.g., 12345-1, 12345-2)
    
    # Stage and status
    stage: str = "clay"  # clay, paint, fulfilled, canceled
    clay_status: str = "sculpting"  # sculpting, feedback_needed, approved, changes_requested
    paint_status: str = "pending"  # pending, painting, feedback_needed, approved, changes_requested
    
    # Flags
    is_manual_order: bool = False  # True if created manually (not from Shopify)
    is_archived: bool = False  # True if order is archived
    shopify_fulfillment_status: Optional[str] = None  # fulfilled, partial, null
    
    # Tracking information
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    tracking_company: Optional[str] = None  # e.g., "UPS", "FedEx", "USPS"
    shipment_status: Optional[str] = None  # e.g., "in_transit", "delivered", "out_for_delivery"
    estimated_delivery: Optional[str] = None
    shipped_at: Optional[str] = None
    
    # Stage timestamps
    clay_entered_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    paint_entered_at: Optional[datetime] = None
    fulfilled_at: Optional[datetime] = None
    canceled_at: Optional[datetime] = None
    
    # Proofs
    clay_proofs: List[ProofImage] = []
    paint_proofs: List[ProofImage] = []
    
    # Approvals
    clay_approval: Optional[ApprovalRequest] = None
    paint_approval: Optional[ApprovalRequest] = None
    
    # Notes
    notes: List[OrderNote] = Field(default_factory=list)
    
    # Metadata
    last_updated_by: str = "admin"  # admin or customer or user_id
    last_updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderCreate(BaseModel):
    shopify_order_id: str
    order_number: str
    customer_email: str
    customer_name: str

class ManualOrderCreate(BaseModel):
    order_number: str
    customer_name: str
    customer_email: str
    stage: str = "clay"
    item_vendor: Optional[str] = None

class ApprovalRequestCreate(BaseModel):
    status: str
    message: Optional[str] = None

class OrderNoteCreate(BaseModel):
    content: str
    visible_to_customer: bool = False
