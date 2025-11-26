from fastapi import HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import jwt
import os
from datetime import datetime, timezone

from models.user import Permission, User

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'

security = HTTPBearer()

class AuthContext:
    """Context object containing authenticated user information"""
    def __init__(self, user: User, token: str):
        self.user = user
        self.token = token
        self.user_id = user.id
        self.tenant_id = user.tenant_id
        self.role = user.role
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if user has a specific permission"""
        return self.user.has_permission(permission)
    
    def require_permission(self, permission: Permission):
        """Raise exception if user doesn't have permission"""
        if not self.has_permission(permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {permission.value} required"
            )

def get_db_dependency():
    """Get database dependency"""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    return client[os.environ['DB_NAME']]

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db = Depends(get_db_dependency)
) -> AuthContext:
    """
    Dependency to get current authenticated user from JWT token
    Usage: current_user: AuthContext = Depends(get_current_user)
    """
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("user_id")
        tenant_id: str = payload.get("tenant_id")
        
        if user_id is None or tenant_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Fetch user from database
        user_doc = await db.users.find_one({"id": user_id, "tenant_id": tenant_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        user = User(**user_doc)
        
        if not user.is_active:
            raise HTTPException(status_code=401, detail="User account is inactive")
        
        return AuthContext(user=user, token=token)
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="Invalid token signature")
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Could not decode token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def require_permissions(*required_permissions: Permission):
    """
    Decorator to require specific permissions
    Usage: @require_permissions(Permission.MANAGE_USERS, Permission.VIEW_ORDERS)
    """
    async def permission_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        for perm in required_permissions:
            if not auth.has_permission(perm):
                raise HTTPException(
                    status_code=403,
                    detail=f"Permission denied: {perm.value} required"
                )
        return auth
    
    return permission_checker

def require_role(*allowed_roles: str):
    """
    Decorator to require specific roles
    Usage: @require_role(UserRole.MAIN_ADMIN)
    """
    async def role_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if auth.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Required role(s): {', '.join(allowed_roles)}"
            )
        return auth
    
    return role_checker
