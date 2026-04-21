"""
User management routes for CRUD operations on users
"""
from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List
import hashlib
import os
from datetime import datetime, timezone

from models.user import User, UserCreate, UserUpdate, UserResponse, Permission, UserRole
from middleware.auth import AuthContext, get_current_user, require_permissions

router = APIRouter(prefix="/users", tags=["User Management"])

def get_db():
    """Dependency that returns the shared tenant-scoped database handle."""
    return _db

# Shared MongoDB client (module singleton - avoids per-request connection leak)
_mongo_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
_db = _mongo_client[os.environ['DB_NAME']]

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_USERS)),
    db = Depends(get_db)
):
    """
    Get all users in the current tenant
    Requires: VIEW_USERS permission
    """
    users = await db.users.find(
        {"tenant_id": auth.tenant_id},
        {"_id": 0}
    ).to_list(1000)
    
    return [UserResponse(**user) for user in users]

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    auth: AuthContext = Depends(require_permissions(Permission.VIEW_USERS)),
    db = Depends(get_db)
):
    """
    Get a specific user by ID
    Requires: VIEW_USERS permission
    """
    user = await db.users.find_one(
        {"id": user_id, "tenant_id": auth.tenant_id},
        {"_id": 0}
    )
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(**user)

@router.post("/", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_USERS)),
    db = Depends(get_db)
):
    """
    Create a new user in the current tenant
    Requires: MANAGE_USERS permission
    """
    # Check if username already exists in this tenant
    existing_user = await db.users.find_one({
        "tenant_id": auth.tenant_id,
        "username": user_data.username
    })
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if email already exists in this tenant
    existing_email = await db.users.find_one({
        "tenant_id": auth.tenant_id,
        "email": user_data.email
    })
    
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    # Hash password
    password_hash = hashlib.sha256(user_data.password.encode()).hexdigest()
    
    # Create user object
    new_user = User(
        tenant_id=auth.tenant_id,
        email=user_data.email,
        username=user_data.username,
        password_hash=password_hash,
        full_name=user_data.full_name,
        role=user_data.role,
        custom_permissions=user_data.custom_permissions,
        created_by=auth.user_id
    )
    
    # Convert to dict for insertion
    user_dict = new_user.model_dump()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    user_dict["updated_at"] = user_dict["updated_at"].isoformat()
    if user_dict.get("last_login"):
        user_dict["last_login"] = user_dict["last_login"].isoformat()
    
    await db.users.insert_one(user_dict)
    
    return UserResponse(**user_dict)

@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_USERS)),
    db = Depends(get_db)
):
    """
    Update an existing user
    Requires: MANAGE_USERS permission
    """
    # Find user
    existing_user = await db.users.find_one({
        "id": user_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prepare update data
    update_data = {}
    
    if user_data.email is not None:
        # Check if email already exists for another user
        email_exists = await db.users.find_one({
            "tenant_id": auth.tenant_id,
            "email": user_data.email,
            "id": {"$ne": user_id}
        })
        if email_exists:
            raise HTTPException(status_code=400, detail="Email already exists")
        update_data["email"] = user_data.email
    
    if user_data.username is not None:
        # Check if username already exists for another user
        username_exists = await db.users.find_one({
            "tenant_id": auth.tenant_id,
            "username": user_data.username,
            "id": {"$ne": user_id}
        })
        if username_exists:
            raise HTTPException(status_code=400, detail="Username already exists")
        update_data["username"] = user_data.username
    
    if user_data.password is not None:
        update_data["password_hash"] = hashlib.sha256(user_data.password.encode()).hexdigest()
    
    if user_data.full_name is not None:
        update_data["full_name"] = user_data.full_name
    
    if user_data.role is not None:
        update_data["role"] = user_data.role.value
    
    if user_data.custom_permissions is not None:
        update_data["custom_permissions"] = [p.value for p in user_data.custom_permissions]
    
    if user_data.is_active is not None:
        update_data["is_active"] = user_data.is_active
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Update user
    await db.users.update_one(
        {"id": user_id, "tenant_id": auth.tenant_id},
        {"$set": update_data}
    )
    
    # Fetch updated user
    updated_user = await db.users.find_one({
        "id": user_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    return UserResponse(**updated_user)

@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    auth: AuthContext = Depends(require_permissions(Permission.MANAGE_USERS)),
    db = Depends(get_db)
):
    """
    Delete a user (soft delete by setting is_active = False)
    Requires: MANAGE_USERS permission
    """
    # Prevent deleting self
    if user_id == auth.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Find user
    existing_user = await db.users.find_one({
        "id": user_id,
        "tenant_id": auth.tenant_id
    }, {"_id": 0})
    
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Soft delete by setting is_active = False
    await db.users.update_one(
        {"id": user_id, "tenant_id": auth.tenant_id},
        {"$set": {
            "is_active": False,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "User deleted successfully", "user_id": user_id}

@router.get("/roles/permissions", response_model=dict)
async def get_role_permissions(
    auth: AuthContext = Depends(get_current_user)
):
    """
    Get all available roles and their default permissions
    """
    from models.user import ROLE_PERMISSIONS
    
    return {
        role.value: [p.value for p in perms]
        for role, perms in ROLE_PERMISSIONS.items()
    }
