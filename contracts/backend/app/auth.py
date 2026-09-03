"""Password hashing (PBKDF2) and JWT-based authorization by role."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response, status
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


# ---------------------------------------------------------------------------
# Session cookies
#
# The session token moved out of localStorage and into an HttpOnly cookie, so
# script running on the page cannot read it — the one thing localStorage can
# never offer. Three cookies, and only one of them is a secret:
#
#   cms_session      the JWT. HttpOnly, so JS cannot touch it.
#   cms_csrf         a random value, readable by JS on purpose. An HttpOnly
#                    cookie is sent by the browser on cross-site requests too,
#                    so cookie auth needs CSRF protection that a cross-site
#                    page cannot forge. It can send the cookie; it cannot read
#                    it to copy into the header. That is the whole mechanism.
#   cms_session_exp  when the session runs out, readable so the UI can warn
#                    before it happens. Carries no authority — the server never
#                    reads it, it only mirrors the JWT's own exp.
#
# The Authorization header still works and takes precedence. API tokens,
# scripts and the whole test suite use it, and a header cannot be attached by a
# cross-site page, so header-authenticated requests are exempt from the CSRF
# check by construction rather than by exception.
SESSION_COOKIE = "cms_session"
CSRF_COOKIE = "cms_csrf"
EXPIRY_COOKIE = "cms_session_exp"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_HEADER = "X-Refresh-Token"

# Methods that cannot change state, and so need no CSRF token.
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})


def _cookie_security() -> dict:
    """Shared cookie attributes.

    `secure` follows the scheme the app is actually served on: setting it on a
    plain-HTTP deployment would make the browser drop the cookie and lock
    everyone out, which is a worse outcome than the flag protects against.
    config.validate() already refuses a localhost APP_BASE_URL in production
    and warns about http://, so this reads that decision rather than repeating it.

    SameSite=Lax, not Strict: the OIDC provider redirects the browser back to
    this app, and Strict would withhold the cookie on that navigation — the user
    would land signed out immediately after signing in. Lax still refuses to
    send the cookie on cross-site POSTs, which is the case that matters.
    """
    return {
        "path": "/",
        "samesite": "lax",
        "secure": settings.APP_BASE_URL.startswith("https://"),
    }


def set_session_cookies(response: Response, user: User) -> str:
    """Start (or renew) a cookie session. Returns the token, for callers that
    also hand it back in the body during the transition."""
    token = create_token(user)
    max_age = settings.JWT_EXPIRY_MINUTES * 60
    security = _cookie_security()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, max_age=max_age, **security)
    response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(32),
                        httponly=False, max_age=max_age, **security)
    expires_at = int(datetime.now(timezone.utc).timestamp()) + max_age
    response.set_cookie(EXPIRY_COOKIE, str(expires_at),
                        httponly=False, max_age=max_age, **security)
    return token


def clear_session_cookies(response: Response) -> None:
    security = _cookie_security()
    for name in (SESSION_COOKIE, CSRF_COOKIE, EXPIRY_COOKIE):
        response.delete_cookie(name, **security)


def _maybe_slide(response: Response | None, user: User, payload: dict,
                 *, from_cookie: bool = False) -> None:
    """Renew the session once the current token is past halfway.

    JWT_EXPIRY_MINUTES is short so that a stolen session dies quickly. Short on
    its own would mean being logged out mid-draft every hour, so the session
    slides instead: any request made in the second half of a token's life
    renews it. An active user never sees a login screen; a session nobody is
    using expires on schedule.

    Cookie sessions are renewed in place with a fresh Set-Cookie. Header
    sessions get the replacement in X-Refresh-Token, because a client managing
    its own token has to be told.

    Deliberately not an endpoint the client has to call on a timer — a timer is
    another thing to get wrong, and it would keep a session alive on a tab
    nobody is looking at.
    """
    if response is None:
        return
    exp = payload.get("exp")
    if not exp:
        return
    total = settings.JWT_EXPIRY_MINUTES * 60
    remaining = exp - datetime.now(timezone.utc).timestamp()
    if remaining >= total / 2:
        return
    if from_cookie:
        # Renew in place. The client never handles the token, which is the
        # point of the cookie, so it has nothing to do here.
        set_session_cookies(response, user)
    else:
        response.headers[REFRESH_HEADER] = create_token(user)


def _presented_token(request: Request | None,
                     credentials: HTTPAuthorizationCredentials | None) -> tuple[str | None, bool]:
    """(token, came_from_cookie).

    The header wins when both are present. A browser holding a cookie session
    that also sends an explicit Authorization header means the caller is being
    deliberate — impersonation tooling, a script, the test suite — and silently
    preferring the ambient cookie would authenticate them as somebody else.
    """
    if credentials is not None:
        return credentials.credentials, False
    if request is not None:
        cookie = request.cookies.get(SESSION_COOKIE)
        if cookie:
            return cookie, True
    return None, False


def _check_csrf(request: Request) -> None:
    """Double-submit check, for cookie-authenticated state changes only.

    A cross-site page can cause the browser to send the session cookie, but the
    same-origin policy stops it reading any cookie to copy into a header. So a
    request that carries the same value in both places came from our own page.
    """
    if request.method in _SAFE_METHODS:
        return
    sent = request.headers.get(CSRF_HEADER) or ""
    expected = request.cookies.get(CSRF_COOKIE) or ""
    if not sent or not expected or not hmac.compare_digest(sent, expected):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Missing or invalid CSRF token. Reload the page and try again.",
        )


def get_current_user(
    request: Request = None,
    response: Response = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    token, from_cookie = _presented_token(request, credentials)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    if from_cookie and request is not None:
        _check_csrf(request)
    _maybe_slide(response, user, payload, from_cookie=from_cookie)
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
    UserRole.AUTHOR, UserRole.LEGAL, UserRole.APPROVER, UserRole.REQUESTER,
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


def optional_current_user(
    request: Request = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """The signed-in user, or None when the request carries no usable session.

    Unlike get_current_user this never raises. It exists for gates that must
    apply *to users* without themselves demanding a user: several routers mix
    role-gated endpoints with token-authenticated ones (vendor share links,
    contract-action links, e-sign webhooks), and those callers are not users at
    all. A gate built on get_current_user would 401 them before their own token
    check ever ran.
    """
    token, _from_cookie = _presented_token(request, credentials)
    if token is None:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    return user


def require_page(key: str):
    """Enforce the admin-configured page access for `key`.

    Applied as a router-level dependency in main.py, *in addition to* each
    endpoint's own role dependency — never instead of it. Both must pass, so
    this can only ever take access away:

      * Removing a role from a page now actually blocks that role's API calls.
        Previously the setting only hid the navigation link, and every endpoint
        behind the hidden page stayed reachable by hand.
      * Adding a role to a page still cannot get it past require_admin and
        friends, so a mistake in the page editor cannot open a hole.

    Denials return 403 with the page named, because the cause is a
    configuration choice an administrator can reverse — an unexplained
    "Insufficient permissions" here sends people hunting through role
    assignments that are not the problem.

    Requests with no signed-in user pass straight through. These routers also
    carry token-authenticated endpoints (vendor share links, contract-action
    links, e-sign webhooks) whose callers hold no role, so there is nothing to
    check; those endpoints are guarded by their own token validation exactly as
    before.
    """
    def checker(
        user: User | None = Depends(optional_current_user),
        db: Session = Depends(get_db),
    ) -> User | None:
        from .services.page_access import can_access
        if user is None:
            return None
        if not can_access(db, {r.value for r in user_roles(user)}, key):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Your role does not have access to the '{key}' page. "
                "An administrator can grant it in Settings → Page Access.",
            )
        return user

    return checker
