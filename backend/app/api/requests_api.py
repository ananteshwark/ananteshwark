"""Contract request intake — the CLM front door.

Any signed-in user can submit a request for a new contract. Authors / legal /
admins triage the queue and convert an approved request into an authoring draft
(from a matching template when one exists, otherwise a scaffold), pre-filled from
the request. Requesters see only their own requests; triagers see them all.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import get_current_user, require_viewer, user_roles
from ..database import get_db
from ..models import (
    ContractDraft,
    ContractRequest,
    ContractTemplate,
    DraftStatus,
    RequestStatus,
    User,
    UserRole,
)
from ..services import authoring
from ..services.user_notifications import create_notification

router = APIRouter(prefix="/requests", tags=["requests"])
log = logging.getLogger(__name__)

TRIAGE_ROLES = {UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LEGAL, UserRole.APPROVER,
                UserRole.VALIDATOR, UserRole.AUTHOR}


def _can_triage(user: User) -> bool:
    return not user_roles(user).isdisjoint(TRIAGE_ROLES)


class RequestIn(BaseModel):
    title: str
    counterparty_name: str | None = None
    contract_type: str | None = None
    department_id: int | None = None
    description: str | None = None
    estimated_value: float | None = None
    currency: str | None = "INR"
    needed_by: str | None = None      # ISO date
    priority: str | None = "normal"


class RequestPatch(BaseModel):
    status: str | None = None
    assigned_to_id: int | None = None
    decision_reason: str | None = None


def _out(r: ContractRequest) -> dict:
    return {
        "id": r.id, "title": r.title, "counterparty_name": r.counterparty_name,
        "contract_type": r.contract_type, "department_id": r.department_id,
        "department_name": r.department.name if r.department else None,
        "description": r.description, "estimated_value": r.estimated_value,
        "currency": r.currency,
        "needed_by": r.needed_by.isoformat() if r.needed_by else None,
        "priority": r.priority, "status": r.status.value,
        "requested_by_id": r.requested_by_id,
        "requested_by_name": r.requested_by.name if r.requested_by else None,
        "assigned_to_id": r.assigned_to_id,
        "assigned_to_name": r.assigned_to.name if r.assigned_to else None,
        "draft_id": r.draft_id, "decision_reason": r.decision_reason,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _parse_date(s):
    from datetime import date
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


class InterpretRequest(BaseModel):
    text: str


@router.post("/interpret")
def interpret_request(payload: InterpretRequest, db: Session = Depends(get_db),
                      _: User = Depends(require_viewer)):
    """Turn a plain-language ask into a pre-filled request (H3). Nothing is
    created — the requester confirms the fields first."""
    from ..services.intake_copilot import interpret
    return interpret(db, payload.text)


@router.post("")
def create_request(payload: RequestIn, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Submit a contract request. Available to any signed-in user."""
    if not payload.title.strip():
        raise HTTPException(400, "A title is required")
    req = ContractRequest(
        title=payload.title.strip(),
        counterparty_name=(payload.counterparty_name or "").strip() or None,
        contract_type=payload.contract_type, department_id=payload.department_id,
        description=(payload.description or "").strip() or None,
        estimated_value=payload.estimated_value,
        currency=payload.currency or "INR",
        needed_by=_parse_date(payload.needed_by),
        priority=payload.priority if payload.priority in ("low", "normal", "high") else "normal",
        status=RequestStatus.SUBMITTED, requested_by_id=user.id,
    )
    db.add(req)
    db.flush()
    # Notify the triage group (legal / admin) that a request needs review.
    triagers = (
        db.query(User)
        .filter(User.is_active.is_(True), User.deleted_at.is_(None),
                User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LEGAL]))
        .all()
    )
    for t in triagers:
        if t.id == user.id:
            continue
        create_notification(db, t.id, "contract_request",
                            f"New contract request from {user.name}: “{req.title}”",
                            link="/requests")
    log_action(db, "contract_request", req.id, "SUBMIT", user_id=user.id, new_value=req.title)
    db.commit()
    return _out(req)


@router.get("")
def list_requests(status: str | None = None, mine: bool = False,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List requests. Requesters see only their own; triagers see all (or their own
    with mine=true)."""
    q = db.query(ContractRequest)
    if not _can_triage(user) or mine:
        q = q.filter(ContractRequest.requested_by_id == user.id)
    if status:
        try:
            q = q.filter(ContractRequest.status == RequestStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    rows = q.order_by(ContractRequest.created_at.desc()).all()
    return {"requests": [_out(r) for r in rows], "can_triage": _can_triage(user)}


@router.get("/{request_id}")
def get_request(request_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    if not _can_triage(user) and req.requested_by_id != user.id:
        raise HTTPException(403, "Not your request")
    return _out(req)


@router.patch("/{request_id}")
def update_request(request_id: int, payload: RequestPatch, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Triage a request: assign it, move it to review, or reject it."""
    if not _can_triage(user):
        raise HTTPException(403, "Only legal / authors can triage requests")
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    if payload.assigned_to_id is not None:
        req.assigned_to_id = payload.assigned_to_id or None
    if payload.decision_reason is not None:
        req.decision_reason = payload.decision_reason.strip() or None
    if payload.status is not None:
        try:
            new_status = RequestStatus(payload.status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {payload.status}")
        if new_status == RequestStatus.CONVERTED:
            raise HTTPException(400, "Use the convert action to turn a request into a draft")
        req.status = new_status
        if new_status == RequestStatus.REJECTED and req.requested_by_id:
            create_notification(db, req.requested_by_id, "request_decided",
                                f"Your contract request “{req.title}” was declined"
                                + (f": {req.decision_reason}" if req.decision_reason else ""),
                                link="/requests")
    log_action(db, "contract_request", req.id, "TRIAGE", user_id=user.id,
               new_value=req.status.value)
    db.commit()
    return _out(req)


@router.post("/{request_id}/convert")
def convert_request(request_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Convert a request into an authoring draft. Uses an active template matching
    the requested contract type when one exists, otherwise a scaffold, pre-filled
    from the request. Only triagers can convert."""
    if not _can_triage(user):
        raise HTTPException(403, "Only legal / authors can convert requests")
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    if req.status == RequestStatus.CONVERTED and req.draft_id:
        raise HTTPException(409, f"Already converted into draft #{req.draft_id}")

    # Pick an active template for the requested type, if any.
    tpl = None
    if req.contract_type:
        tpl = (
            db.query(ContractTemplate)
            .filter(ContractTemplate.contract_type == req.contract_type,
                    ContractTemplate.is_active.is_(True),
                    ContractTemplate.deleted_at.is_(None))
            .order_by(ContractTemplate.version.desc())
            .first()
        )

    fields: dict = dict(tpl.field_defaults or {}) if tpl else {"currency": req.currency or "INR"}
    if req.counterparty_name:
        fields.setdefault("vendor", req.counterparty_name)
    if req.estimated_value is not None:
        fields.setdefault("contract_value", req.estimated_value)
    fields.setdefault("currency", req.currency or "INR")
    fields.setdefault("contract_type", req.contract_type)
    authoring.recompute_fields(fields)
    document = (tpl.body if tpl else None) or authoring.scaffold_document(req.contract_type)

    draft = ContractDraft(
        title=req.title, contract_type=req.contract_type, status=DraftStatus.DRAFT,
        fields=fields, document=document, department_id=req.department_id,
        template_id=tpl.id if tpl else None, origin="request", created_by_id=user.id,
    )
    db.add(draft)
    db.flush()
    from ..api.authoring_api import _snapshot
    _snapshot(db, draft, user.id, note="created from request")
    req.status = RequestStatus.CONVERTED
    req.draft_id = draft.id
    req.assigned_to_id = req.assigned_to_id or user.id
    if req.requested_by_id and req.requested_by_id != user.id:
        create_notification(db, req.requested_by_id, "request_decided",
                            f"Your contract request “{req.title}” is now being drafted",
                            link=f"/authoring/drafts/{draft.id}")
    log_action(db, "contract_request", req.id, "CONVERT", user_id=user.id,
               new_value=f"draft #{draft.id}")
    log_action(db, "contract_draft", draft.id, "CREATE", user_id=user.id,
               new_value=f"request #{req.id}: {req.title}")
    db.commit()
    return {"draft_id": draft.id, "request": _out(req)}
