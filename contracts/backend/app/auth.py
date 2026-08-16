"""Password hashing (PBKDF2) and JWT-based authorization by role."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User, UserRole

_ITERATIONS = 260_000
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = hashed.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    return user


def user_roles(user: User) -> set[UserRole]:
    """All roles a user holds — the primary `role` plus any `extra_roles`. A user
    can be granted several roles (e.g. VALIDATOR + LEGAL)."""
    roles = {user.role}
    for name in (getattr(user, "extra_roles", None) or []):
        try:
            roles.add(UserRole(name))
        except ValueError:
            continue
    return roles


def require_roles(*roles: UserRole):
    def checker(user: User = Depends(get_current_user)) -> User:
        held = user_roles(user)
        # SUPER_ADMIN supersedes every role gate.
        if UserRole.SUPER_ADMIN in held:
            return user
        if held.isdisjoint(roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker


# Only the super admin (delete records, top-level administration).
require_super_admin = require_roles(UserRole.SUPER_ADMIN)
require_admin = require_roles(UserRole.ADMIN)
require_validator = require_roles(UserRole.ADMIN, UserRole.VALIDATOR)
# Everyone signed in (including the authoring roles) can read.
require_viewer = require_roles(
    UserRole.ADMIN, UserRole.VALIDATOR, UserRole.VIEWER,
    UserRole.AUTHOR, UserRole.LEGAL, UserRole.APPROVER,
)

# Contract Authoring permissions (Module F):
#  - author: create/edit drafts, insert clauses, share, send for signature.
#  - legal:  govern legal-approved clauses and the legal approval gate.
#  - approver: sign off value/finance approval gates.
require_author = require_roles(
    UserRole.ADMIN, UserRole.VALIDATOR, UserRole.AUTHOR, UserRole.LEGAL, UserRole.APPROVER,
)
require_legal = require_roles(UserRole.ADMIN, UserRole.LEGAL)
require_approver = require_roles(UserRole.ADMIN, UserRole.APPROVER, UserRole.LEGAL)
