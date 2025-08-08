"""
Authentication and authorization for Snowsarva
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import structlog

from .config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
ALGORITHM = "HS256"
security = HTTPBearer(auto_error=False)

class TokenData(BaseModel):
    """Token data model"""
    username: Optional[str] = None
    scopes: list[str] = []

class User(BaseModel):
    """User model"""
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    disabled: Optional[bool] = False
    roles: list[str] = []
    permissions: list[str] = []

class UserInDB(User):
    """User model with hashed password"""
    hashed_password: str

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> TokenData:
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        scopes = payload.get("scopes", [])
        token_data = TokenData(username=username, scopes=scopes)
        return token_data
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """Get current authenticated user"""
    
    # In SPCS environment, we can trust the container's authentication
    # This is a simplified authentication for the Native App context
    if settings.ENVIRONMENT == "production":
        # In production (SPCS), we rely on Snowflake's container authentication
        # The container service is already authenticated with the Snowflake account
        return User(
            username="snowflake_user",
            email=None,
            full_name="Snowflake Container User",
            disabled=False,
            roles=["app_user"],
            permissions=["read", "write", "admin"]
        )
    
    # For development/testing, use JWT authentication
    if not credentials:
        # Allow anonymous access in development
        if settings.is_development:
            return User(
                username="dev_user",
                email="dev@snowsarva.com",
                full_name="Development User",
                disabled=False,
                roles=["admin"],
                permissions=["read", "write", "admin"]
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify JWT token
    token_data = verify_token(credentials.credentials)
    
    # In a real implementation, you would fetch user from database
    # For now, return a mock user based on token data
    user = User(
        username=token_data.username,
        email=f"{token_data.username}@company.com",
        full_name=token_data.username.replace("_", " ").title(),
        disabled=False,
        roles=["app_user"],
        permissions=["read", "write"]
    )
    
    if user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user

def check_permission(required_permission: str):
    """Dependency to check if user has required permission"""
    def permission_checker(current_user: User = Depends(get_current_user)):
        if required_permission not in current_user.permissions and "admin" not in current_user.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required permission: {required_permission}"
            )
        return current_user
    return permission_checker

def check_role(required_role: str):
    """Dependency to check if user has required role"""
    def role_checker(current_user: User = Depends(get_current_user)):
        if required_role not in current_user.roles and "admin" not in current_user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}"
            )
        return current_user
    return role_checker

class RateLimiter:
    """Simple rate limiter"""
    
    def __init__(self):
        self.requests = {}
        self.window_size = 60  # 1 minute window
        self.max_requests = settings.API_RATE_LIMIT
    
    async def check_rate_limit(self, key: str) -> bool:
        """Check if request should be rate limited"""
        now = datetime.utcnow().timestamp()
        
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside the window
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if now - req_time < self.window_size
        ]
        
        # Check if within limit
        if len(self.requests[key]) >= self.max_requests:
            return False
        
        # Add current request
        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter()

async def check_rate_limit(request: Request):
    """Rate limiting dependency"""
    if not settings.is_production:
        return  # Skip rate limiting in development
    
    client_ip = request.client.host
    if not await rate_limiter.check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )

def check_ip_whitelist():
    """IP whitelist dependency"""
    def ip_checker(request: Request):
        if not settings.ALLOWED_IPS:
            return  # No IP restriction
        
        client_ip = request.client.host
        allowed_ips = [ip.strip() for ip in settings.ALLOWED_IPS.split(",")]
        
        if client_ip not in allowed_ips:
            logger.warning("Unauthorized IP access attempt", 
                         client_ip=client_ip,
                         allowed_ips=allowed_ips)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="IP address not allowed"
            )
        
        return client_ip
    return ip_checker