"""Admin management of API tokens for the documented read-only REST API (G17).
The raw token is returned once at creation and never stored in the clear."""
import secrets
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin
from ..database import get_db
from ..models import ApiToken, User
from .public_api import hash_token

router = APIRouter(prefix="/api-tokens", tags=["api-tokens"])


class TokenIn(BaseModel):
    name: str
    expires_on: date | None = None


def _out(t: ApiToken) -> dict:
    return {
        "id": t.id, "name": t.name, "prefix": t.prefix, "active": t.active,
        "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
def list_tokens(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = (
        db.query(ApiToken)
        .filter(ApiToken.deleted_at.is_(None))
        .order_by(ApiToken.created_at.desc())
        .all()
    )
    return [_out(t) for t in rows]


@router.post("")
def create_token(payload: TokenIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if not payload.name.strip():
        raise HTTPException(400, "Name is required")
    raw = "cms_" + secrets.token_hex(24)
    expires_at = None
    if payload.expires_on:
        expires_at = datetime(payload.expires_on.year, payload.expires_on.month,
                              payload.expires_on.day, 23, 59, 59, tzinfo=timezone.utc)
    t = ApiToken(
        name=payload.name.strip(), prefix=raw[:12], token_hash=hash_token(raw),
        expires_at=expires_at, created_by_id=user.id,
    )
    db.add(t)
    db.flush()
    log_action(db, "api_token", t.id, "CREATE", user_id=user.id, new_value=t.name)
    db.commit()
    # The raw token is returned exactly once.
    return {**_out(t), "token": raw}


@router.post("/{token_id}/revoke")
def revoke_token(token_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    t = db.get(ApiToken, token_id)
    if t is None or t.deleted_at is not None:
        raise HTTPException(404, "Token not found")
    t.active = False
    log_action(db, "api_token", t.id, "REVOKE", user_id=user.id)
    db.commit()
    return _out(t)


@router.delete("/{token_id}")
def delete_token(token_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    t = db.get(ApiToken, token_id)
    if t is None or t.deleted_at is not None:
        raise HTTPException(404, "Token not found")
    t.deleted_at = datetime.now(timezone.utc)
    t.active = False
    log_action(db, "api_token", t.id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}
