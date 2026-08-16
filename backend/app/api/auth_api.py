from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import secrets

from ..auth import (
    create_token,
    get_current_user,
    hash_password,
    require_admin,
    require_validator,
    verify_password,
)
from ..audit import log_action
from ..database import get_db
from ..models import User, UserRole, utcnow
from ..schemas import (
    ChangePassword,
    GoogleLoginRequest,
    LoginRequest,
    PasswordReset,
    UserCreate,
    UserUpdate,
)
from ..serializers import user_out
from ..services.google_auth import GoogleAuthError, decide_google_access, verify_google_id_token
from ..services.login_throttle import throttle
from ..services.settings_store import get_setting

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    key = payload.email.lower()
    wait = throttle.retry_after(key)
    if wait > 0:
        raise HTTPException(
            429, "Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )
    user = db.query(User).filter(User.email == payload.email, User.deleted_at.is_(None)).first()
    if user is None or not user.is_active or not verify_password(payload.password, user.hashed_password):
        throttle.record_failure(key)
        raise HTTPException(401, "Invalid email or password")
    throttle.reset(key)
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/config")
def auth_config(db: Session = Depends(get_db)):
    """Public: tells the login page whether to show the Google button."""
    enabled = get_setting(db, "google_auth_enabled") == "true"
    client_id = get_setting(db, "google_client_id")
    return {"google_enabled": bool(enabled and client_id), "google_client_id": client_id if enabled else ""}


@router.post("/google")
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    if get_setting(db, "google_auth_enabled") != "true":
        raise HTTPException(403, "Google sign-in is not enabled")
    client_id = get_setting(db, "google_client_id")
    try:
        info = verify_google_id_token(payload.credential, client_id)
    except GoogleAuthError as exc:
        raise HTTPException(401, str(exc))

    email = (info.get("email") or "").lower()
    user = db.query(User).filter(User.email == email, User.deleted_at.is_(None)).first()
    decision, reason = decide_google_access(
        email,
        bool(info.get("email_verified")),
        user is not None,
        allowed_domain=get_setting(db, "google_allowed_domain"),
        auto_provision=get_setting(db, "google_auto_provision") == "true",
    )
    if decision == "deny":
        raise HTTPException(403, reason)

    if decision == "provision":
        try:
            role = UserRole(get_setting(db, "google_default_role") or "VIEWER")
        except ValueError:
            role = UserRole.VIEWER
        user = User(
            email=email,
            name=info.get("name") or email,
            # Unusable password — this account signs in via Google only
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role=role,
        )
        db.add(user)
        db.flush()
        log_action(db, "user", user.id, "GOOGLE_PROVISION", user_id=user.id, new_value=email)
        db.commit()

    if not user.is_active:
        raise HTTPException(401, "User is inactive")
    log_action(db, "user", user.id, "GOOGLE_LOGIN", user_id=user.id)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


# ---------------------------------------------------------------------------
# On-prem SSO via generic OIDC (G11). Local login always remains available.
# ---------------------------------------------------------------------------

@router.get("/oidc/config")
def oidc_config(db: Session = Depends(get_db)):
    """Public: whether to show the SSO button, and its label."""
    from ..services import oidc
    return {"oidc_enabled": oidc.is_enabled(db),
            "button_label": get_setting(db, "oidc_button_label") or "Sign in with SSO"}


@router.get("/oidc/login")
def oidc_login(db: Session = Depends(get_db)):
    """Return the IdP authorization URL (with a signed state) for the SPA to
    redirect the browser to."""
    from ..services import oidc
    if not oidc.is_enabled(db):
        raise HTTPException(403, "SSO is not enabled")
    state = oidc.make_state()
    return {"authorization_url": oidc.authorization_url(db, state)}


@router.get("/oidc/callback")
def oidc_callback(code: str, state: str, db: Session = Depends(get_db)):
    """IdP redirect target: verify state, exchange the code, provision/authorize
    the user, and hand back an app token. The SPA reads the token from the JSON
    (or is redirected here and forwards it)."""
    from fastapi.responses import RedirectResponse
    from ..services import oidc
    if not oidc.is_enabled(db):
        raise HTTPException(403, "SSO is not enabled")
    if not oidc.verify_state(state):
        raise HTTPException(400, "Invalid or expired SSO state")
    try:
        access_token = oidc.exchange_code(db, code)
        info = oidc.fetch_userinfo(db, access_token)
    except oidc.OidcError as exc:
        raise HTTPException(401, str(exc))

    email = info["email"]
    user = db.query(User).filter(User.email == email, User.deleted_at.is_(None)).first()
    decision, reason = oidc.decide_access(db, email, user is not None)
    if decision == "deny":
        raise HTTPException(403, reason)
    if decision == "provision":
        try:
            role = UserRole(get_setting(db, "oidc_default_role") or "VIEWER")
        except ValueError:
            role = UserRole.VIEWER
        user = User(email=email, name=info.get("name") or email,
                    hashed_password=hash_password(secrets.token_urlsafe(32)), role=role)
        db.add(user)
        db.flush()
        log_action(db, "user", user.id, "OIDC_PROVISION", user_id=user.id, new_value=email)
        db.commit()
    if not user.is_active:
        raise HTTPException(401, "User is inactive")
    log_action(db, "user", user.id, "OIDC_LOGIN", user_id=user.id)
    db.commit()
    token = create_token(user)
    # Redirect the browser back to the SPA login page with the token in the URL,
    # which the frontend consumes and then cleans out of the address bar.
    return RedirectResponse(url=f"/login?sso_token={token}", status_code=302)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.post("/change-password")
def change_password(payload: ChangePassword, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Self-service password change (verifies the current password)."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(401, "Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    log_action(db, "user", user.id, "CHANGE_PASSWORD", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [user_out(u) for u in db.query(User).filter(User.deleted_at.is_(None)).all()]


@router.get("/users-lite")
def users_lite(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Active users (id + name only) for task-owner / @mention pickers. Available
    to any signed-in user."""
    rows = (
        db.query(User)
        .filter(User.is_active.is_(True), User.deleted_at.is_(None))
        .order_by(User.name)
        .all()
    )
    return [{"id": u.id, "name": u.name, "email": u.email} for u in rows]


@router.get("/assignable-users")
def assignable_users(db: Session = Depends(get_db), _: User = Depends(require_validator)):
    """Active users who can own/validate contracts (for the assignee picker).
    Available to validators, unlike the full admin-only user list."""
    rows = (
        db.query(User)
        .filter(
            User.deleted_at.is_(None),
            User.is_active.is_(True),
            User.role.in_([UserRole.ADMIN, UserRole.VALIDATOR]),
        )
        .order_by(User.name)
        .all()
    )
    return [{"id": u.id, "name": u.name, "email": u.email, "role": u.role.value} for u in rows]


def _parse_roles(role_value: str, roles: list[str] | None) -> tuple[UserRole, list[str]]:
    """Resolve a (primary_role, extra_role_names) pair from either a single `role`
    or a multi-role `roles` list. The first entry is the primary role."""
    names = roles if roles else [role_value]
    names = [n for n in dict.fromkeys(names) if n]  # de-dupe, keep order
    if not names:
        names = ["VIEWER"]
    parsed: list[UserRole] = []
    for n in names:
        try:
            parsed.append(UserRole(n))
        except ValueError:
            raise HTTPException(400, f"Invalid role: {n}")
    primary = parsed[0]
    extras = [r.value for r in parsed[1:]]
    return primary, extras


@router.post("/users")
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already registered")
    role, extras = _parse_roles(payload.role, payload.roles)
    user = User(
        email=payload.email,
        name=payload.name,
        hashed_password=hash_password(payload.password),
        role=role,
        extra_roles=extras,
    )
    db.add(user)
    db.flush()
    log_action(db, "user", user.id, "CREATE", user_id=admin.id, new_value=payload.email)
    db.commit()
    return user_out(user)


def _other_active_admins(db: Session, exclude_id: int) -> int:
    return (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active.is_(True), User.deleted_at.is_(None))
        .filter(User.id != exclude_id)
        .count()
    )


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(404, "User not found")
    return user


@router.patch("/users/{user_id}")
def update_user(
    user_id: int, payload: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    user = _get_user(db, user_id)
    # Resolve the requested role set (multi-role `roles` wins over single `role`).
    new_role, new_extras = None, None
    if payload.roles is not None or payload.role is not None:
        new_role, new_extras = _parse_roles(payload.role or user.role.value, payload.roles)

    # Guard against removing the last admin (by demotion or deactivation). ADMIN
    # anywhere in the new role set counts as "still an admin".
    admin_after = new_role is not None and (
        new_role == UserRole.ADMIN or UserRole.ADMIN.value in (new_extras or [])
    )
    demoting = new_role is not None and not admin_after
    deactivating = payload.is_active is False
    if user.role == UserRole.ADMIN and (demoting or deactivating) and _other_active_admins(db, user.id) == 0:
        raise HTTPException(400, "Cannot demote or deactivate the last active administrator")

    if payload.name is not None:
        user.name = payload.name
    if new_role is not None:
        old = [user.role.value] + list(user.extra_roles or [])
        new = [new_role.value] + new_extras
        if old != new:
            log_action(db, "user", user.id, "ROLE_CHANGE", user_id=admin.id,
                       field="role", old_value=", ".join(old), new_value=", ".join(new))
            user.role = new_role
            user.extra_roles = new_extras
    if payload.is_active is not None and payload.is_active != user.is_active:
        log_action(db, "user", user.id, "ACTIVATE" if payload.is_active else "DEACTIVATE", user_id=admin.id,
                   field="is_active", old_value=user.is_active, new_value=payload.is_active)
        user.is_active = payload.is_active
    db.commit()
    return user_out(user)


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int, payload: PasswordReset, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    user = _get_user(db, user_id)
    user.hashed_password = hash_password(payload.new_password)
    log_action(db, "user", user.id, "RESET_PASSWORD", user_id=admin.id)
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    if user.role == UserRole.ADMIN and _other_active_admins(db, user.id) == 0:
        raise HTTPException(400, "Cannot delete the last active administrator")
    user.deleted_at = utcnow()
    user.is_active = False
    log_action(db, "user", user.id, "SOFT_DELETE", user_id=admin.id, old_value=user.email)
    db.commit()
    return {"ok": True}
