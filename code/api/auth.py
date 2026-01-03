"""
JWT-based authentication and role-based access control.

Provides dependencies for protecting endpoints with authentication and role checks.
"""
import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import BaseModel

from code.config import JWT_SECRET_KEY, JWT_ALGORITHM
from code.api.utils import api_error


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


class TokenData(BaseModel):
    """Decoded JWT token data."""
    email: str
    role: str


def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[TokenData]:
    """
    Parameters:
        token (str | None): JWT token from Authorization header.

    Returns:
        TokenData | None: Decoded user data if token is valid, None if no token provided.

    Raises:
        HTTPException: 401 if token is invalid or malformed.

    Does:
        Decodes and validates JWT token. Returns None for public endpoints (no token),
        raises 401 for invalid tokens on protected endpoints.
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role", "public")
        if email is None:
            raise api_error(
                status.HTTP_401_UNAUTHORIZED,
                "invalid_token",
                "Invalid token: missing subject",
            )
        return TokenData(email=email, role=role)
    except JWTError as exc:
        raise api_error(
            status.HTTP_401_UNAUTHORIZED,
            "invalid_token",
            "Invalid token",
        ) from exc


def require_role(required_role: str):
    """
    Parameters:
        required_role (str): Minimum required role ("lab_user" or "admin").

    Returns:
        Dependency function that checks user role.

    Does:
        Creates a FastAPI dependency that requires authentication and the specified role.
        Returns 401 for unauthenticated requests, 403 for insufficient permissions.
    """
    def checker(user: Optional[TokenData] = Depends(get_current_user)) -> TokenData:
        if user is None:
            raise api_error(
                status.HTTP_401_UNAUTHORIZED,
                "authentication_required",
                "Authentication required",
            )
        role_hierarchy = {"public": 0, "lab_user": 1, "admin": 2}
        user_level = role_hierarchy.get(user.role, 0)
        required_level = role_hierarchy.get(required_role, 0)
        if user_level < required_level:
            raise api_error(
                status.HTTP_403_FORBIDDEN,
                "insufficient_permissions",
                "Insufficient permissions",
                {"required_role": required_role, "user_role": user.role},
            )
        return user
    return checker

