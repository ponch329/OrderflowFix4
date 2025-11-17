from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid
from enum import Enum

class UserRole(str, Enum):
    """User roles in the system"""
    MAIN_ADMIN = "main_admin"  # Full access to everything including user management
    MANUFACTURER = "manufacturer"  # Limited access based on tenant settings
    CUSTOMER_SERVICE = "customer_service"  # Can manage orders and communicate with customers
    ORDER_MANAGER = "order_manager"  # Can view and update order statuses

class Permission(str, Enum):
    """Granular permissions for users"""
    # User management
    MANAGE_USERS = "manage_users"
    VIEW_USERS = "view_users"
    
    # Order management
    VIEW_ORDERS = "view_orders"
    CREATE_ORDERS = "create_orders"
    EDIT_ORDERS = "edit_orders"
    DELETE_ORDERS = "delete_orders"
    ARCHIVE_ORDERS = "archive_orders"
    
    # Proof management
    UPLOAD_PROOFS = "upload_proofs"
    DELETE_PROOFS = "delete_proofs"
    VIEW_PROOFS = "view_proofs"
    
    # Customer communication
    SEND_EMAILS = "send_emails"
    VIEW_CUSTOMER_INFO = "view_customer_info"
    
    # Settings
    MANAGE_SETTINGS = "manage_settings"
    VIEW_SETTINGS = "view_settings"
    
    # Shopify
    SYNC_SHOPIFY = "sync_shopify"
    
    # Analytics
    VIEW_ANALYTICS = "view_analytics"
    
    # Notes
    ADD_NOTES = "add_notes"
    VIEW_NOTES = "view_notes"

# Default permissions for each role
ROLE_PERMISSIONS = {
    UserRole.MAIN_ADMIN: [
        Permission.MANAGE_USERS,
        Permission.VIEW_USERS,
        Permission.VIEW_ORDERS,
        Permission.CREATE_ORDERS,
        Permission.EDIT_ORDERS,
        Permission.DELETE_ORDERS,
        Permission.ARCHIVE_ORDERS,
        Permission.UPLOAD_PROOFS,
        Permission.DELETE_PROOFS,
        Permission.VIEW_PROOFS,
        Permission.SEND_EMAILS,
        Permission.VIEW_CUSTOMER_INFO,
        Permission.MANAGE_SETTINGS,
        Permission.VIEW_SETTINGS,
        Permission.SYNC_SHOPIFY,
        Permission.VIEW_ANALYTICS,
        Permission.ADD_NOTES,
        Permission.VIEW_NOTES,
    ],
    UserRole.MANUFACTURER: [
        Permission.VIEW_ORDERS,
        Permission.UPLOAD_PROOFS,
        Permission.VIEW_PROOFS,
        Permission.ADD_NOTES,
        Permission.VIEW_NOTES,
    ],
    UserRole.CUSTOMER_SERVICE: [
        Permission.VIEW_ORDERS,
        Permission.EDIT_ORDERS,
        Permission.UPLOAD_PROOFS,
        Permission.VIEW_PROOFS,
        Permission.SEND_EMAILS,
        Permission.VIEW_CUSTOMER_INFO,
        Permission.VIEW_ANALYTICS,
        Permission.ADD_NOTES,
        Permission.VIEW_NOTES,
    ],
    UserRole.ORDER_MANAGER: [
        Permission.VIEW_ORDERS,
        Permission.CREATE_ORDERS,
        Permission.EDIT_ORDERS,
        Permission.ARCHIVE_ORDERS,
        Permission.VIEW_PROOFS,
        Permission.VIEW_ANALYTICS,
        Permission.ADD_NOTES,
        Permission.VIEW_NOTES,
    ],
}

class User(BaseModel):
    """User model with role-based access control"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str  # Reference to tenant
    
    # User info
    email: EmailStr
    username: str
    password_hash: str
    full_name: str
    
    # Role and permissions
    role: UserRole
    custom_permissions: List[Permission] = Field(default_factory=list)  # Override default permissions
    
    # Status
    is_active: bool = True
    last_login: Optional[datetime] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None  # User ID who created this user

    def get_permissions(self) -> List[Permission]:
        """Get all permissions for this user (role + custom)"""
        base_permissions = set(ROLE_PERMISSIONS.get(self.role, []))
        custom_perms = set(self.custom_permissions)
        return list(base_permissions.union(custom_perms))
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if user has a specific permission"""
        return permission in self.get_permissions()

class UserCreate(BaseModel):
    """Schema for creating a new user"""
    email: EmailStr
    username: str
    password: str
    full_name: str
    role: UserRole
    custom_permissions: List[Permission] = Field(default_factory=list)

class UserUpdate(BaseModel):
    """Schema for updating user information"""
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    custom_permissions: Optional[List[Permission]] = None
    is_active: Optional[bool] = None

class UserLogin(BaseModel):
    """Schema for user login"""
    username: str
    password: str

class UserResponse(BaseModel):
    """Schema for user response (without password)"""
    model_config = ConfigDict(extra="ignore")
    
    id: str
    tenant_id: str
    email: EmailStr
    username: str
    full_name: str
    role: UserRole
    custom_permissions: List[Permission]
    is_active: bool
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime
