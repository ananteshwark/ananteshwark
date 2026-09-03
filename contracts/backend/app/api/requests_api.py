"""Contract request intake — the CLM front door.

Any signed-in user can submit a request for a new contract. Authors / legal /
admins triage the queue and convert an approved request into an authoring draft
(from a matching template when one exists, otherwise a scaffold), pre-filled from
the request. Requesters see only their own requests; triagers see them all.
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import get_current_user, require_viewer, user_roles
from ..database import get_db
from ..models import (
    Contract,
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
    # Intake detail — what the requester already knows, asked once here instead
    # of being chased during triage.
    internal_entity: str | None = None
    purpose: str | None = None
    counterparty_address: str | None = None
    spoc_name: str | None = None      # defaults to the signed-in user
    phi_shared: bool | None = None
    start_date: str | None = None     # ISO date
    end_date: str | None = None       # ISO date; derived from tenure when absent
    tenure: str | None = None


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
        "internal_entity": r.internal_entity, "purpose": r.purpose,
        "counterparty_address": r.counterparty_address, "spoc_name": r.spoc_name,
        "phi_shared": r.phi_shared, "tenure": r.tenure,
        "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "template_filename": r.template_filename,
        "requested_by_id": r.requested_by_id,
        "requested_by_name": r.requested_by.name if r.requested_by else None,
        "assigned_to_id": r.assigned_to_id,
        "assigned_to_name": r.assigned_to.name if r.assigned_to else None,
        "draft_id": r.draft_id, "decision_reason": r.decision_reason,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _term(payload) -> dict:
    """Start/end dates for a request, filling in the end from the tenure.

    Uses the same derivation as the register, so a request saying "2 Years from
    1 April" and the contract it becomes agree on when it ends rather than
    differing by a day over who counts the last one.
    """
    from ..services.dates import derive_dates
    start = _parse_date(payload.start_date)
    end = _parse_date(payload.end_date)
    start, end, _ = derive_dates(start, end, payload.tenure)
    return {"start_date": start, "end_date": end}


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
        internal_entity=(payload.internal_entity or "").strip() or None,
        purpose=(payload.purpose or "").strip() or None,
        counterparty_address=(payload.counterparty_address or "").strip() or None,
        # The SPOC is whoever is raising the request unless they name someone else.
        spoc_name=(payload.spoc_name or "").strip() or user.name or user.email,
        phi_shared=payload.phi_shared,
        tenure=(payload.tenure or "").strip() or None,
        **_term(payload),
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
def convert_request(request_id: int, origin: str | None = None,
                    template_id: int | None = None, source_contract_id: int | None = None,
                    db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Convert a request into an authoring draft, pre-filled from the request.

    The starting point is the author's choice, the same four offered on the New
    contract page: `scratch`, `template` (with `template_id`), `duplicate` (with
    `source_contract_id`), and — because it needs a file upload — `import`, which
    creates the draft through the authoring import endpoint and then calls
    `link-draft` below. Converting used to silently pick a template by contract
    type, which is still the default when no origin is given.

    Only triagers can convert."""
    if not _can_triage(user):
        raise HTTPException(403, "Only legal / authors can convert requests")
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    if req.status == RequestStatus.CONVERTED and req.draft_id:
        raise HTTPException(409, f"Already converted into draft #{req.draft_id}")

    choice = (origin or "").strip().lower()
    if choice and choice not in ("scratch", "template", "duplicate"):
        raise HTTPException(400, "origin must be scratch, template or duplicate "
                                 "(use the import endpoint then link-draft for a file)")

    # Pick an active template: the one asked for, or — when no choice was made —
    # the newest active one matching the requested type, as before.
    tpl = None
    if choice == "template":
        if not template_id:
            raise HTTPException(400, "template_id is required to start from a template")
        tpl = db.get(ContractTemplate, template_id)
        if tpl is None or tpl.deleted_at is not None:
            raise HTTPException(404, "Template not found")
    elif choice in ("", None) and req.contract_type:
        tpl = (
            db.query(ContractTemplate)
            .filter(ContractTemplate.contract_type == req.contract_type,
                    ContractTemplate.is_active.is_(True),
                    ContractTemplate.deleted_at.is_(None))
            .order_by(ContractTemplate.version.desc())
            .first()
        )

    source = None
    if choice == "duplicate":
        if not source_contract_id:
            raise HTTPException(400, "source_contract_id is required to duplicate")
        source = db.get(Contract, source_contract_id)
        if source is None or source.deleted_at is not None:
            raise HTTPException(404, "Source contract not found")

    fields: dict = dict(tpl.field_defaults or {}) if tpl else {"currency": req.currency or "INR"}
    if source is not None:
        # Carry the body and the stable register values; instance values (dates,
        # PO, signatures) belong to the contract being copied, not to this one.
        from ..services import authoring as _authoring
        fields.update({k: v for k, v in (_authoring.fields_from_contract(source) or {}).items()
                       if v not in (None, "")})
    if req.counterparty_name:
        fields.setdefault("vendor", req.counterparty_name)
    if req.estimated_value is not None:
        fields.setdefault("contract_value", req.estimated_value)
    fields.setdefault("currency", req.currency or "INR")
    fields.setdefault("contract_type", req.contract_type)
    # Everything the requester already told us, so the author is not asked again.
    for key, value in (("signing_entity", req.internal_entity),
                       ("vendor_address", req.counterparty_address),
                       ("service_summary", req.purpose),
                       ("contract_tenure", req.tenure),
                       ("start_date", req.start_date.isoformat() if req.start_date else None),
                       ("end_date", req.end_date.isoformat() if req.end_date else None),
                       ("phi_shared", req.phi_shared)):
        if value not in (None, ""):
            fields.setdefault(key, value)
    authoring.recompute_fields(fields)
    document = ((source.extracted_text and authoring.document_from_text(source.extracted_text))
                if source is not None else None) \
        or (tpl.body if tpl else None) or authoring.scaffold_document(req.contract_type)

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


@router.post("/{request_id}/template")
def upload_request_template(request_id: int, file: UploadFile = File(...),
                            db: Session = Depends(get_db),
                            user: User = Depends(get_current_user)):
    """Attach the counterparty's own template to a request.

    Requesters often already have the other side's paper. Without somewhere to
    put it, it gets emailed separately and re-attached later — or lost, and the
    draft starts from a template nobody wanted.
    """
    from pathlib import Path

    from ..config import settings
    from ..services.upload_guard import DOC_EXTS, save_upload
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    # The requester or a triager — nobody else needs to change someone's request.
    if req.requested_by_id != user.id and not _can_triage(user):
        raise HTTPException(403, "Only the requester or legal can attach a document")

    dest_dir = Path(settings.ATTACHMENTS_DIR) / "requests" / str(req.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "template").name
    dest = dest_dir / safe_name
    save_upload(file, dest, allowed_exts=DOC_EXTS)

    req.template_filename = safe_name
    req.template_path = str(dest.resolve())
    log_action(db, "contract_request", req.id, "ATTACH_TEMPLATE", user_id=user.id, new_value=safe_name)
    db.commit()
    return _out(req)


@router.get("/{request_id}/template")
def download_request_template(request_id: int, db: Session = Depends(get_db),
                              _: User = Depends(get_current_user)):
    """The counterparty template attached to a request."""
    from pathlib import Path

    from fastapi.responses import FileResponse
    req = db.get(ContractRequest, request_id)
    if req is None or not req.template_path:
        raise HTTPException(404, "No document attached to this request")
    path = Path(req.template_path)
    if not path.exists():
        raise HTTPException(404, "The attached document is no longer on disk")
    media = ("application/pdf" if path.suffix.lower() == ".pdf"
             else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return FileResponse(str(path), media_type=media, filename=req.template_filename or path.name)


@router.post("/{request_id}/link-draft")
def link_draft(request_id: int, draft_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    """Mark a request converted into a draft that already exists.

    Starting from an uploaded Word/PDF needs a file, so that draft is created by
    the authoring import endpoint; this attaches it to the request so the two
    do not drift apart. Without it, choosing "import" from a request would leave
    the request sitting in the queue next to the draft it produced.
    """
    if not _can_triage(user):
        raise HTTPException(403, "Only legal / authors can convert requests")
    req = db.get(ContractRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    if req.status == RequestStatus.CONVERTED and req.draft_id:
        raise HTTPException(409, f"Already converted into draft #{req.draft_id}")
    draft = db.get(ContractDraft, draft_id)
    if draft is None or draft.deleted_at is not None:
        raise HTTPException(404, "Draft not found")

    req.status = RequestStatus.CONVERTED
    req.draft_id = draft.id
    req.assigned_to_id = req.assigned_to_id or user.id
    if not draft.department_id and req.department_id:
        draft.department_id = req.department_id
    log_action(db, "contract_request", req.id, "CONVERT", user_id=user.id,
               new_value=f"draft #{draft.id} (imported document)")
    db.commit()
    return {"draft_id": draft.id, "request": _out(req)}
