"""One-tap approval from the notification email (H4).

An approver receives the request by email and can decide it there, without
logging into the SPA. The token is single-use and scoped to exactly one draft
and one approval stage, so it cannot be replayed or used to reach anything else
— the same posture as the renew/terminate tokens already in the expiry emails.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..models import ApprovalToken, ContractDraft, User

router = APIRouter(prefix="/approval-action", tags=["approval-action"])

TOKEN_TTL_DAYS = 14


class Decision(BaseModel):
    note: str | None = None


def issue_token(db: Session, draft_id: int, stage_key: str, user: User) -> str:
    """Mint a token for one approver on one stage. Any earlier unused token for
    the same approver/stage is retired so only the newest link works."""
    (db.query(ApprovalToken)
       .filter(ApprovalToken.draft_id == draft_id, ApprovalToken.stage_key == stage_key,
               ApprovalToken.approver_user_id == user.id, ApprovalToken.used_at.is_(None))
       .delete(synchronize_session=False))
    tok = ApprovalToken(
        token=secrets.token_urlsafe(32), draft_id=draft_id, stage_key=stage_key,
        approver_user_id=user.id, approver_email=user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    )
    db.add(tok)
    db.flush()
    return tok.token


def _load(db: Session, token: str) -> ApprovalToken:
    row = db.query(ApprovalToken).filter(ApprovalToken.token == token).first()
    if row is None:
        raise HTTPException(404, "This approval link is not valid.")
    if row.used_at is not None:
        raise HTTPException(410, f"This link was already used to {row.decision or 'decide'}.")
    if row.expires_at and row.expires_at.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(410, "This approval link has expired. Please sign in to decide.")
    return row


@router.get("/{token}")
def open_approval(token: str, db: Session = Depends(get_db)):
    """What this link is for — shown before the approver commits to a decision."""
    row = _load(db, token)
    draft = db.get(ContractDraft, row.draft_id)
    if draft is None or draft.deleted_at is not None:
        raise HTTPException(404, "The draft for this approval no longer exists.")
    return {
        "draft_id": draft.id, "draft_title": draft.title,
        "contract_type": draft.contract_type, "stage": row.stage_key,
        "approver_email": row.approver_email,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
    }


def _decide(db: Session, token: str, request: Request, decision: str, note: str | None):
    row = _load(db, token)
    user = db.get(User, row.approver_user_id) if row.approver_user_id else None
    if user is None or not user.is_active:
        raise HTTPException(403, "The approver for this link is no longer active.")

    from .esign_api import _record_decision
    result = _record_decision(db, row.draft_id, row.stage_key, user, decision, note)

    row.used_at = datetime.now(timezone.utc)
    row.decision = decision
    log_action(db, "contract_draft", row.draft_id, f"APPROVAL_{decision}", user_id=user.id,
               field=row.stage_key,
               new_value=f"via email link from {request.client.host if request.client else 'unknown'}")
    db.commit()
    return {"ok": True, "decision": decision, "stage": row.stage_key, **result}


@router.post("/{token}/approve")
def approve(token: str, payload: Decision, request: Request, db: Session = Depends(get_db)):
    return _decide(db, token, request, "APPROVED", payload.note)


@router.post("/{token}/reject")
def reject(token: str, payload: Decision, request: Request, db: Session = Depends(get_db)):
    return _decide(db, token, request, "REJECTED", payload.note)
