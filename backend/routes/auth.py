"""
Authentication routes for user login and token management
"""
from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
import hashlib
import jwt
import os
from datetime import datetime, timezone, timedelta

from models.user import UserLogin, User

router = APIRouter(prefix="/auth", tags=["Authentication"])

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

def get_db():
    """Dependency that returns the shared tenant-scoped database handle."""
    return _db

# Shared MongoDB client (module singleton - avoids per-request connection leak)
_mongo_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
_db = _mongo_client[os.environ['DB_NAME']]

@router.post("/login")
async def login(login_data: UserLogin, db = Depends(get_db)):
    """
    User login endpoint - returns JWT token
    """
    # Hash the provided password
    password_hash = hashlib.sha256(login_data.password.encode()).hexdigest()
    
    # Find user by username
    user_doc = await db.users.find_one(
        {"username": login_data.username},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Verify password
    if user_doc["password_hash"] != password_hash:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    user = User(**user_doc)
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")
    
    # Create JWT token
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    token_data = {
        "user_id": user.id,
        "tenant_id": user.tenant_id,
        "username": user.username,
        "role": user.role.value,
        "exp": expiration
    }
    token = jwt.encode(token_data, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    # Update last login
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "token": token,
        "expires_at": expiration.isoformat(),
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value,
            "permissions": [p.value for p in user.get_permissions()],
            "assigned_vendor": user.assigned_vendor
        }
    }

@router.post("/verify")
async def verify_token(db = Depends(get_db)):
    """
    Verify JWT token and return user info
    """
    # This will use the auth middleware to verify token
    from middleware.auth import get_current_user
    auth = await get_current_user(db=db)
    
    return {
        "valid": True,
        "user": {
            "id": auth.user_id,
            "username": auth.user.username,
            "full_name": auth.user.full_name,
            "email": auth.user.email,
            "role": auth.role.value,
            "permissions": [p.value for p in auth.user.get_permissions()]
        }
    }

@router.get("/me")
async def get_current_user_info(db = Depends(get_db)):
    """
    Get current authenticated user information
    """
    from middleware.auth import get_current_user
    
    auth = await get_current_user(db=db)
    
    return {
        "id": auth.user_id,
        "username": auth.user.username,
        "full_name": auth.user.full_name,
        "email": auth.user.email,
        "role": auth.role.value,
        "permissions": [p.value for p in auth.user.get_permissions()],
        "tenant_id": auth.tenant_id
    }
