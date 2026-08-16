"""Contract Authoring Module API: templates, drafts, autosave + version history,
and finalize-into-the-register. Everything a draft produces flows into the same
Contract record / vendor history / duplicate detection / reminder engine.
"""
import difflib
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_author, require_viewer
from ..database import get_db
from ..models import (
    Contract,
    ContractAttachment,
    ContractDraft,
    ContractStatus,
    ContractTemplate,
    DraftAttachment,
    DraftReviewMessage,
    DraftReviewRequest,
    DraftStatus,
    DraftVersion,
    Tag,
    User,
    UserRole,
)
from ..schemas import DraftCreate, DraftUpdate, PromoteToTemplate, TemplateIn
from ..services import authoring

router = APIRouter(prefix="/authoring", tags=["authoring"])
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _template_out(t: ContractTemplate) -> dict:
    return {
        "id": t.id, "name": t.name, "contract_type": t.contract_type,
        "department_id": t.department_id,
        "department_name": t.department.name if t.department else None,
        "description": t.description, "version": t.version, "is_active": t.is_active,
        "parent_id": t.parent_id, "body": t.body, "field_defaults": t.field_defaults or {},
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# The contract-authoring workflow, in order. Each draft sits at one stage; the
# stage is derived from its status + vendor acceptance + execution.
STAGE_LABELS = [
    "Draft completion",
    "Internal review & confirmation",
    "Vendor review & confirmation",
    "Ready for signature",
    "Sent for signature",
    "Signed — in contracts",
]


def _draft_stage_index(d: ContractDraft) -> int:
    from ..models import DraftStatus as DS
    if d.contract_id is not None or d.status == DS.EXECUTED:
        return 5
    if d.status == DS.OUT_FOR_SIGNATURE:
        return 4
    if d.vendor_accepted_at is not None or d.status == DS.INTERNAL_APPROVED:
        return 3
    if d.status in (DS.SHARED_WITH_VENDOR, DS.NEGOTIATION):
        return 2
    if d.status == DS.INTERNAL_REVIEW:
        return 1
    return 0


def _review_out(r: DraftReviewRequest) -> dict:
    return {
        "id": r.id, "draft_id": r.draft_id,
        "reviewer_id": r.reviewer_id,
        "reviewer_name": r.reviewer.name if r.reviewer else None,
        "requested_by_id": r.requested_by_id,
        "requested_by_name": r.requested_by.name if r.requested_by else None,
        "excerpt": r.excerpt, "note": r.note,
        "status": r.status, "outcome": r.outcome,
        "reviewer_comment": r.reviewer_comment,
        "suggested_text": r.suggested_text,
        "resolution": r.resolution,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "requested_at": r.requested_at.isoformat() if r.requested_at else None,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "messages": [
            {
                "id": m.id, "user_id": m.user_id,
                "user_name": m.user.name if m.user else None,
                "body": m.body,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in (r.messages or [])
        ],
    }


def _review_summary(db: Session, draft_id: int) -> dict:
    rows = db.query(DraftReviewRequest).filter(DraftReviewRequest.draft_id == draft_id).all()
    pending = sum(1 for r in rows if r.status == "pending")
    return {"total": len(rows), "pending": pending, "reviewed": len(rows) - pending}


def _draft_out(d: ContractDraft, detail: bool = False) -> dict:
    out = {
        "id": d.id, "title": d.title, "contract_type": d.contract_type,
        "status": d.status.value, "origin": d.origin,
        "vendor_id": d.vendor_id, "vendor_name": d.vendor.name if d.vendor else (d.fields or {}).get("vendor"),
        "department_id": d.department_id,
        "department_name": d.department.name if d.department else None,
        "source_contract_id": d.source_contract_id, "template_id": d.template_id,
        "renews_contract_id": d.renews_contract_id, "link_as": d.link_as,
        "contract_id": d.contract_id,
        "vendor_accepted_at": d.vendor_accepted_at.isoformat() if d.vendor_accepted_at else None,
        "internal_reviewed_at": d.internal_reviewed_at.isoformat() if d.internal_reviewed_at else None,
        "rev": d.rev or 0,
        "created_by_id": d.created_by_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "stage_index": _draft_stage_index(d),
        "stage": STAGE_LABELS[_draft_stage_index(d)],
        "stages": STAGE_LABELS,
    }
    if detail:
        out["fields"] = d.fields or {}
        out["document"] = d.document
        out["bound_fields"] = sorted(authoring.bound_fields(d.document))
    return out


def _get_draft(db: Session, draft_id: int) -> ContractDraft:
    d = db.get(ContractDraft, draft_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Draft not found")
    return d


def _restricted_fields(db: Session) -> set[str]:
    from ..services.settings_store import get_setting
    raw = get_setting(db, "restricted_authoring_fields") or ""
    return {f.strip() for f in raw.replace("\n", ",").split(",") if f.strip()}


@router.get("/field-policy")
def field_policy(db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Which register fields are restricted, and whether this user may edit them."""
    return {
        "restricted": sorted(_restricted_fields(db)),
        "can_edit_restricted": user.role in (UserRole.ADMIN, UserRole.LEGAL),
    }


def _snapshot(db: Session, draft: ContractDraft, user_id: int | None, note: str | None) -> DraftVersion:
    last = (
        db.query(DraftVersion)
        .filter(DraftVersion.draft_id == draft.id)
        .order_by(DraftVersion.version_no.desc())
        .first()
    )
    version_no = (last.version_no + 1) if last else 1
    ver = DraftVersion(
        draft_id=draft.id, version_no=version_no, document=draft.document,
        fields=draft.fields, note=note, created_by_id=user_id,
    )
    db.add(ver)
    return ver


# ---------------------------------------------------------------------------
# Contract-type scaffolds
# ---------------------------------------------------------------------------

@router.get("/scaffold")
def scaffold(contract_type: str | None = None, _: User = Depends(require_viewer)):
    """Preview the standard section skeleton for a contract type."""
    return {"document": authoring.scaffold_document(contract_type)}


# ---------------------------------------------------------------------------
# Template Library
# ---------------------------------------------------------------------------

@router.get("/templates")
def list_templates(
    contract_type: str | None = None, department_id: int | None = None,
    include_inactive: bool = False, db: Session = Depends(get_db), _: User = Depends(require_viewer),
):
    q = db.query(ContractTemplate).filter(ContractTemplate.deleted_at.is_(None))
    if not include_inactive:
        q = q.filter(ContractTemplate.is_active.is_(True))
    if contract_type:
        q = q.filter(ContractTemplate.contract_type == contract_type)
    if department_id:
        q = q.filter(ContractTemplate.department_id == department_id)
    rows = q.order_by(ContractTemplate.name, ContractTemplate.version.desc()).all()
    return [_template_out(t) for t in rows]


@router.get("/templates/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    t = db.get(ContractTemplate, template_id)
    if t is None or t.deleted_at is not None:
        raise HTTPException(404, "Template not found")
    return _template_out(t)


@router.post("/templates")
def create_template(payload: TemplateIn, db: Session = Depends(get_db), user: User = Depends(require_author)):
    body = payload.body or authoring.scaffold_document(payload.contract_type)
    t = ContractTemplate(
        name=payload.name, contract_type=payload.contract_type, department_id=payload.department_id,
        description=payload.description, body=body, field_defaults=payload.field_defaults or {},
        version=1, is_active=True, created_by_id=user.id,
    )
    db.add(t)
    db.flush()
    log_action(db, "contract_template", t.id, "CREATE", user_id=user.id, new_value=t.name)
    db.commit()
    return _template_out(t)


@router.put("/templates/{template_id}")
def update_template(
    template_id: int, payload: TemplateIn, db: Session = Depends(get_db), user: User = Depends(require_author),
):
    """Save a new version of a template (version control): the prior row is
    deactivated and a new active version is created linked via parent_id."""
    current = db.get(ContractTemplate, template_id)
    if current is None or current.deleted_at is not None:
        raise HTTPException(404, "Template not found")
    root_id = current.parent_id or current.id
    max_version = (
        db.query(ContractTemplate)
        .filter((ContractTemplate.id == root_id) | (ContractTemplate.parent_id == root_id))
        .order_by(ContractTemplate.version.desc())
        .first()
    )
    db.query(ContractTemplate).filter(
        (ContractTemplate.id == root_id) | (ContractTemplate.parent_id == root_id)
    ).update({ContractTemplate.is_active: False})
    new_t = ContractTemplate(
        name=payload.name or current.name, contract_type=payload.contract_type,
        department_id=payload.department_id, description=payload.description,
        body=payload.body or current.body, field_defaults=payload.field_defaults or current.field_defaults or {},
        version=(max_version.version + 1) if max_version else current.version + 1,
        is_active=True, parent_id=root_id, created_by_id=user.id,
    )
    db.add(new_t)
    db.flush()
    log_action(db, "contract_template", new_t.id, "NEW_VERSION", user_id=user.id,
               new_value=f"v{new_t.version} of {new_t.name}")
    db.commit()
    return _template_out(new_t)


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    t = db.get(ContractTemplate, template_id)
    if t is None or t.deleted_at is not None:
        raise HTTPException(404, "Template not found")
    t.deleted_at = datetime.now(timezone.utc)
    t.is_active = False
    log_action(db, "contract_template", t.id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------

@router.get("/drafts")
def list_drafts(
    mine: bool = False, include_finalized: bool = True,
    db: Session = Depends(get_db), user: User = Depends(require_viewer),
):
    q = db.query(ContractDraft).filter(ContractDraft.deleted_at.is_(None))
    if mine:
        q = q.filter(ContractDraft.created_by_id == user.id)
    if not include_finalized:
        q = q.filter(ContractDraft.contract_id.is_(None))
    rows = q.order_by(ContractDraft.updated_at.desc()).all()
    return [_draft_out(d) for d in rows]


@router.post("/drafts/import")
def import_draft(file: UploadFile = File(...), title: str | None = None,
                 contract_type: str | None = None, third_party: bool = False,
                 db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Start a draft from an uploaded Word/PDF: extract its text and rebuild an
    editable document so the author can continue in the workspace (#5).

    `third_party=true` marks the draft as counterparty paper so it can be
    clause-mapped against our library and playbook (G13)."""
    import tempfile
    from pathlib import Path

    from ..services.text_extraction import extract_text
    from ..services.upload_guard import DOC_EXTS, read_upload

    name = file.filename or "import"
    ext = Path(name).suffix.lower()
    data = read_upload(file, allowed_exts=DOC_EXTS)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        text = extract_text(tmp_path)
    except Exception as exc:
        raise HTTPException(422, f"Could not read the document: {exc}")
    finally:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except Exception:
            pass
    if not (text or "").strip():
        raise HTTPException(422, "No readable text was found in the document.")

    document = authoring.document_from_text(text)
    fields = {"currency": "INR", "contract_type": contract_type}
    authoring.recompute_fields(fields)
    origin = "third_party" if third_party else "import"
    draft = ContractDraft(
        title=title or Path(name).stem or "Imported contract",
        contract_type=contract_type, status=DraftStatus.DRAFT,
        fields=fields, document=document, origin=origin, created_by_id=user.id,
    )
    db.add(draft)
    db.flush()
    _snapshot(db, draft, user.id,
              note="imported counterparty paper" if third_party else "imported from document")
    log_action(db, "contract_draft", draft.id, "CREATE", user_id=user.id,
               new_value=f"{'third-party ' if third_party else ''}import: {name}")
    db.commit()
    return _draft_out(draft, detail=True)


@router.post("/drafts/{draft_id}/auto-redline")
def auto_redline(draft_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Propose concrete playbook edits for this draft's off-playbook clauses (H1).

    Each proposal lands as a pending tracked change, so it is reviewed, accepted
    or rejected exactly like a counterparty redline."""
    from ..services.autoredline import propose_redlines
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "This draft is finalized and can no longer be redlined")
    result = propose_redlines(db, draft)
    log_action(db, "contract_draft", draft_id, "AUTO_REDLINE", user_id=user.id,
               new_value=f"{result['proposed']} proposal(s)")
    db.commit()
    return result


@router.get("/changes/{change_id}/advice")
def change_advice(change_id: int, db: Session = Depends(get_db), _: User = Depends(require_author)):
    """Recommend a response to a counterparty change, with a drafted reply (H2)."""
    from ..models import TrackedChange
    from ..services.negotiation_copilot import advise, draft_reply
    change = db.get(TrackedChange, change_id)
    if change is None:
        raise HTTPException(404, "Change not found")
    advice = advise(db, change)
    advice["reply"] = draft_reply(db, change, advice)
    return advice


@router.get("/drafts/{draft_id}/clause-map")
def draft_clause_map(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Map a draft's clauses onto the clause library and playbook (G13). Built
    for reviewing third-party paper: each block is classified, matched to the
    closest approved library version, and given its playbook position."""
    from ..services.playbook import map_clauses
    draft = _get_draft(db, draft_id)
    return map_clauses(db, draft)


@router.post("/drafts")
def create_draft(payload: DraftCreate, db: Session = Depends(get_db), user: User = Depends(require_author)):
    origin = (payload.origin or "scratch").lower()
    fields: dict = {}
    document = None
    title = payload.title
    contract_type = payload.contract_type
    vendor_id = None
    department_id = None
    source_contract_id = None
    template_id = None

    if origin == "duplicate":
        if not payload.source_contract_id:
            raise HTTPException(400, "source_contract_id is required to duplicate")
        src = db.get(Contract, payload.source_contract_id)
        if src is None or src.deleted_at is not None:
            raise HTTPException(404, "Source contract not found")
        # Renewals are deduplicated: if a renewal draft for this contract is
        # already in the queue, open that one instead of stacking another.
        if (payload.link_as or "").lower() == "renewal":
            from ..services.contract_actions import find_pending_renewal_draft
            pending = find_pending_renewal_draft(db, src.sr_no)
            if pending is not None:
                out = _draft_out(pending, detail=True)
                out["reused"] = True
                return out
        # Renewals roll the term forward (keep tenure); plain copies clear dates.
        if (payload.link_as or "").lower() == "renewal":
            fields = authoring.renewal_fields_from_contract(src)
        else:
            fields = authoring.clear_instance_fields(authoring.fields_from_contract(src))
        contract_type = contract_type or src.contract_type
        vendor_id = src.vendor_id
        department_id = src.department_id
        source_contract_id = src.sr_no
        # Clone the authored document if the source was authored; otherwise rebuild
        # an editable document from its extracted text so the content/structure
        # matches the original instead of a blank scaffold.
        src_draft = (
            db.query(ContractDraft)
            .filter(ContractDraft.contract_id == src.sr_no, ContractDraft.document.isnot(None))
            .order_by(ContractDraft.id.desc())
            .first()
        )
        if src_draft:
            document = src_draft.document
        elif src.extracted_text:
            document = authoring.document_from_text(src.extracted_text)
        else:
            document = authoring.scaffold_document(contract_type)
        title = title or (f"Renewal of #{src.sr_no}" if (payload.link_as or "").lower() == "renewal"
                          else f"Copy of contract #{src.sr_no}")

    elif origin == "template":
        if not payload.template_id:
            raise HTTPException(400, "template_id is required to author from a template")
        tpl = db.get(ContractTemplate, payload.template_id)
        if tpl is None or tpl.deleted_at is not None:
            raise HTTPException(404, "Template not found")
        fields = dict(tpl.field_defaults or {})
        authoring.recompute_fields(fields)
        document = tpl.body or authoring.scaffold_document(tpl.contract_type)
        contract_type = contract_type or tpl.contract_type
        department_id = tpl.department_id
        template_id = tpl.id
        title = title or f"{tpl.name}"

    else:  # scratch
        origin = "scratch"
        fields = {"currency": "INR", "contract_type": contract_type}
        authoring.recompute_fields(fields)
        document = authoring.scaffold_document(contract_type)
        title = title or (f"New {contract_type}" if contract_type else "New contract")

    fields.setdefault("contract_type", contract_type)
    draft = ContractDraft(
        title=title, contract_type=contract_type, status=DraftStatus.DRAFT,
        fields=fields, document=document, vendor_id=vendor_id, department_id=department_id,
        source_contract_id=source_contract_id, template_id=template_id, origin=origin,
        renews_contract_id=(payload.source_contract_id if payload.link_as else None),
        link_as=payload.link_as, created_by_id=user.id,
    )
    db.add(draft)
    db.flush()
    _snapshot(db, draft, user.id, note="created")
    log_action(db, "contract_draft", draft.id, "CREATE", user_id=user.id,
               new_value=f"{origin}: {title}")
    db.commit()
    return _draft_out(draft, detail=True)


# Registered before "/drafts/{draft_id}" so the literal path wins.
@router.get("/drafts/deleted")
def list_deleted_drafts(db: Session = Depends(get_db), _: User = Depends(require_author)):
    """Soft-deleted drafts, most-recently-deleted first, for restore (3.18)."""
    rows = (
        db.query(ContractDraft)
        .filter(ContractDraft.deleted_at.isnot(None))
        .order_by(ContractDraft.deleted_at.desc())
        .limit(200).all()
    )
    return [{"id": d.id, "title": d.title, "contract_type": d.contract_type,
             "deleted_at": d.deleted_at.isoformat() if d.deleted_at else None}
            for d in rows]


@router.post("/drafts/{draft_id}/restore-deleted")
def restore_deleted_draft(draft_id: int, db: Session = Depends(get_db),
                          user: User = Depends(require_author)):
    """Bring a soft-deleted draft back."""
    draft = db.get(ContractDraft, draft_id)
    if draft is None or draft.deleted_at is None:
        raise HTTPException(404, "No deleted draft with that id")
    draft.deleted_at = None
    log_action(db, "contract_draft", draft.id, "RESTORE", user_id=user.id)
    db.commit()
    return _draft_out(draft, detail=True)


def _draft_is_signed(db: Session, d: ContractDraft) -> bool:
    """True once the document is signed: executed via e-signature, a completed
    e-sign envelope exists, or a signed document has been attached."""
    if d.status == DraftStatus.EXECUTED or d.contract_id is not None:
        return True
    from ..models import ESignEnvelope, EnvelopeStatus
    env = (
        db.query(ESignEnvelope)
        .filter(ESignEnvelope.draft_id == d.id, ESignEnvelope.status == EnvelopeStatus.COMPLETED)
        .first()
    )
    if env is not None:
        return True
    signed = (
        db.query(DraftAttachment)
        .filter(DraftAttachment.draft_id == d.id, DraftAttachment.kind == "signed",
                DraftAttachment.deleted_at.is_(None))
        .first()
    )
    return signed is not None


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    d = _get_draft(db, draft_id)
    out = _draft_out(d, detail=True)
    out["signed"] = _draft_is_signed(db, d)
    return out


@router.put("/drafts/{draft_id}")
def update_draft(draft_id: int, payload: DraftUpdate, db: Session = Depends(get_db),
                 user: User = Depends(require_author)):
    """Autosave: apply field/document/status changes, recompute derived values,
    and snapshot a new version when content changed."""
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized into a contract and is read-only")
    if draft.status in (DraftStatus.OUT_FOR_SIGNATURE, DraftStatus.EXECUTED):
        raise HTTPException(409, "Draft is frozen for signature — void the envelope to edit")
    # Optimistic concurrency: reject a save based on a stale revision so two
    # editors don't silently clobber each other.
    if payload.base_rev is not None and (draft.rev or 0) != payload.base_rev:
        raise HTTPException(409, {
            "message": "This draft was changed elsewhere since you loaded it.",
            "current_rev": draft.rev or 0,
        })

    before_doc, before_fields = draft.document, draft.fields

    if payload.title is not None:
        draft.title = payload.title
    if payload.contract_type is not None:
        draft.contract_type = payload.contract_type
    if payload.vendor_id is not None:
        draft.vendor_id = payload.vendor_id or None
    if payload.department_id is not None:
        draft.department_id = payload.department_id or None
    if payload.link_as is not None:
        draft.link_as = payload.link_as or None
    if payload.renews_contract_id is not None:
        draft.renews_contract_id = payload.renews_contract_id or None
    if payload.status is not None:
        try:
            new_status = DraftStatus(payload.status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {payload.status}")
        if new_status != draft.status:
            # Record the transition so cycle-time analytics can measure time-in-stage.
            log_action(db, "contract_draft", draft.id, "STATUS_CHANGE", user_id=user.id,
                       field="status", old_value=draft.status.value, new_value=new_status.value)
            draft.status = new_status
    if payload.fields is not None:
        # Field-level permissions: only Legal/Admin may change restricted fields.
        restricted = _restricted_fields(db)
        if restricted and user.role not in (UserRole.ADMIN, UserRole.LEGAL):
            existing = draft.fields or {}
            blocked = [k for k, v in payload.fields.items()
                       if k in restricted and existing.get(k) != v]
            if blocked:
                raise HTTPException(403, f"Restricted field(s) editable only by Legal: {', '.join(sorted(blocked))}")
        fields = {**(draft.fields or {}), **payload.fields}
        authoring.recompute_fields(fields)
        draft.fields = fields
        if draft.contract_type is None and fields.get("contract_type"):
            draft.contract_type = fields.get("contract_type")
    if payload.document is not None:
        draft.document = payload.document

    changed = (draft.document != before_doc) or (draft.fields != before_fields)
    if changed:
        draft.rev = (draft.rev or 0) + 1
        _snapshot(db, draft, user.id, note=payload.note)
    log_action(db, "contract_draft", draft.id, "UPDATE", user_id=user.id)
    db.commit()
    return _draft_out(draft, detail=True)


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    draft = _get_draft(db, draft_id)
    # Ledger-retention safety: a finalized/executed draft is the source of a
    # registered contract and its negotiation ledger — it must not be deleted.
    if draft.contract_id is not None:
        raise HTTPException(
            409, f"Draft is finalized into contract #{draft.contract_id}; its negotiation "
                 "ledger is retained and the draft cannot be deleted.")
    draft.deleted_at = datetime.now(timezone.utc)
    log_action(db, "contract_draft", draft.id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Draft attachments + tags while drafting (3.15)
# ---------------------------------------------------------------------------

@router.get("/drafts/{draft_id}/attachments")
def list_draft_attachments(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_draft(db, draft_id)
    rows = (db.query(DraftAttachment)
            .filter(DraftAttachment.draft_id == draft_id, DraftAttachment.deleted_at.is_(None))
            .order_by(DraftAttachment.id).all())
    return [{"id": a.id, "filename": a.filename, "kind": a.kind, "size_bytes": a.size_bytes,
             "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else None} for a in rows]


@router.post("/drafts/{draft_id}/attachments")
def add_draft_attachment(draft_id: int, file: UploadFile = File(...), kind: str = "other",
                         db: Session = Depends(get_db), user: User = Depends(require_author)):
    from pathlib import Path
    from ..config import settings
    from ..services.upload_guard import ATTACHMENT_EXTS, save_upload
    draft = _get_draft(db, draft_id)
    dest_dir = Path(settings.ATTACHMENTS_DIR) / "drafts" / str(draft.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "document").name
    dest = dest_dir / safe_name
    written = save_upload(file, dest, allowed_exts=ATTACHMENT_EXTS)
    att = DraftAttachment(
        draft_id=draft.id, filename=safe_name, path=str(dest.resolve()),
        kind=kind if kind in ("amendment", "annexure", "signed", "other") else "other",
        size_bytes=written, uploaded_by_id=user.id,
    )
    db.add(att)
    db.flush()
    log_action(db, "contract_draft", draft.id, "ADD_ATTACHMENT", user_id=user.id, new_value=safe_name)
    db.commit()
    return {"id": att.id, "filename": att.filename, "kind": att.kind}


@router.get("/drafts/{draft_id}/attachments/{attachment_id}/file")
def download_draft_attachment(draft_id: int, attachment_id: int, db: Session = Depends(get_db),
                              _: User = Depends(require_viewer)):
    from pathlib import Path
    from fastapi.responses import FileResponse
    att = db.get(DraftAttachment, attachment_id)
    if att is None or att.draft_id != draft_id or att.deleted_at is not None or not Path(att.path).exists():
        raise HTTPException(404, "Attachment not found")
    return FileResponse(att.path, filename=att.filename)


@router.delete("/drafts/{draft_id}/attachments/{attachment_id}")
def delete_draft_attachment(draft_id: int, attachment_id: int, db: Session = Depends(get_db),
                            user: User = Depends(require_author)):
    att = db.get(DraftAttachment, attachment_id)
    if att is None or att.draft_id != draft_id or att.deleted_at is not None:
        raise HTTPException(404, "Attachment not found")
    att.deleted_at = datetime.now(timezone.utc)
    log_action(db, "contract_draft", draft_id, "DELETE_ATTACHMENT", user_id=user.id)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Version history: timeline, diff, restore
# ---------------------------------------------------------------------------

@router.get("/drafts/{draft_id}/versions")
def list_versions(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_draft(db, draft_id)
    rows = (
        db.query(DraftVersion)
        .filter(DraftVersion.draft_id == draft_id)
        .order_by(DraftVersion.version_no.desc())
        .all()
    )
    return [
        {"version_no": v.version_no, "note": v.note, "created_by_id": v.created_by_id,
         "created_at": v.created_at.isoformat() if v.created_at else None}
        for v in rows
    ]


def _version(db, draft_id, version_no) -> DraftVersion:
    v = (
        db.query(DraftVersion)
        .filter(DraftVersion.draft_id == draft_id, DraftVersion.version_no == version_no)
        .first()
    )
    if v is None:
        raise HTTPException(404, "Version not found")
    return v


@router.get("/drafts/{draft_id}/versions/{version_no}")
def get_version(draft_id: int, version_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    v = _version(db, draft_id, version_no)
    return {"version_no": v.version_no, "document": v.document, "fields": v.fields or {},
            "note": v.note, "created_at": v.created_at.isoformat() if v.created_at else None}


@router.get("/drafts/{draft_id}/diff")
def diff_versions(draft_id: int, a: int, b: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Unified text diff between two snapshots (rendered with merge values)."""
    va, vb = _version(db, draft_id, a), _version(db, draft_id, b)
    ta = authoring.render_text(va.document, va.fields or {}).splitlines()
    tb = authoring.render_text(vb.document, vb.fields or {}).splitlines()
    diff = list(difflib.unified_diff(ta, tb, fromfile=f"v{a}", tofile=f"v{b}", lineterm=""))
    return {"a": a, "b": b, "diff": diff}


@router.get("/drafts/{draft_id}/compare")
def compare_versions(draft_id: int, base: int, target: int = 0,
                     db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Side-by-side, block-aligned diff. `target=0` compares against the live
    (current) draft; otherwise against that version number."""
    from ..services.collaboration import document_block_diff
    draft = _get_draft(db, draft_id)
    base_v = _version(db, draft_id, base)
    if target == 0:
        target_doc, target_label = draft.document, "current"
    else:
        tv = _version(db, draft_id, target)
        target_doc, target_label = tv.document, f"v{tv.version_no}"
    rows = document_block_diff(base_v.document, target_doc)
    return {"base": f"v{base_v.version_no}", "target": target_label,
            "rows": rows,
            "changed": sum(1 for r in rows if r["tag"] != "equal")}


@router.post("/drafts/{draft_id}/restore/{version_no}")
def restore_version(draft_id: int, version_no: int, db: Session = Depends(get_db),
                    user: User = Depends(require_author)):
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized and is read-only")
    v = _version(db, draft_id, version_no)
    draft.document = v.document
    draft.fields = v.fields
    _snapshot(db, draft, user.id, note=f"restored v{version_no}")
    log_action(db, "contract_draft", draft.id, "RESTORE_VERSION", user_id=user.id, new_value=f"v{version_no}")
    db.commit()
    return _draft_out(draft, detail=True)


# ---------------------------------------------------------------------------
# Promote a draft into a reusable template
# ---------------------------------------------------------------------------

@router.post("/drafts/{draft_id}/promote-template")
def promote_to_template(draft_id: int, payload: PromoteToTemplate, db: Session = Depends(get_db),
                        user: User = Depends(require_author)):
    draft = _get_draft(db, draft_id)
    defaults = dict(draft.fields or {})
    for f in authoring.INSTANCE_FIELDS:
        defaults.pop(f, None)
    # Re-tokenize concrete values typed as free text back into merge chips so the
    # template is reusable rather than carrying one contract's specifics.
    body = authoring.retokenize_document(draft.document, draft.fields or {})
    tpl = ContractTemplate(
        name=payload.name, contract_type=draft.contract_type,
        department_id=payload.department_id or draft.department_id, description=payload.description,
        body=body, field_defaults=defaults, version=1, is_active=True, created_by_id=user.id,
    )
    db.add(tpl)
    db.flush()
    log_action(db, "contract_template", tpl.id, "PROMOTE_FROM_DRAFT", user_id=user.id,
               new_value=f"{tpl.name} from draft #{draft.id}")
    db.commit()
    return _template_out(tpl)


# ---------------------------------------------------------------------------
# Finalize a draft into the contract register (enters the existing pipeline)
# ---------------------------------------------------------------------------

def _parse_date(s):
    if isinstance(s, date):
        return s
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


@router.get("/drafts/{draft_id}/export.docx")
def export_docx(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Download the draft as a Word document (DOCX) from the structured model."""
    from fastapi.responses import Response
    from ..services.docx import document_to_docx
    draft = _get_draft(db, draft_id)
    data = document_to_docx(draft.title or "Contract", draft.document or {}, draft.fields or {})
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}.docx"'},
    )


@router.get("/drafts/{draft_id}/export.pdf")
def export_pdf(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Download the draft as a PDF from the structured model."""
    from fastapi.responses import Response
    from ..services.authoring import render_text
    from ..services.pdf import text_to_pdf
    draft = _get_draft(db, draft_id)
    body = render_text(draft.document, draft.fields or {})
    # Unfinalized drafts carry a DRAFT watermark so exported copies aren't mistaken
    # for an executed contract.
    watermark = None if draft.contract_id else "DRAFT"
    data = text_to_pdf((draft.title or "Contract").upper(), body, watermark=watermark)
    return Response(
        content=data, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}.pdf"'},
    )


@router.get("/drafts/{draft_id}/redline.docx")
def export_redline_docx(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Download a redline DOCX: the draft plus vendor changes (insertions
    underlined, deletions struck-through) and their dispositions."""
    from fastapi.responses import Response
    from ..models import TrackedChange
    from ..services.docx import redline_to_docx
    draft = _get_draft(db, draft_id)
    rows = db.query(TrackedChange).filter(TrackedChange.draft_id == draft_id).order_by(TrackedChange.id).all()
    changes = [{
        "clause_type": c.clause_type, "change_type": c.change_type.value,
        "original_text": c.original_text, "proposed_text": c.proposed_text,
        "author_email": c.author_email, "rationale": c.rationale,
        "disposition": c.disposition.value, "disposition_reason": c.disposition_reason,
        "countered_text": c.countered_text,
    } for c in rows]
    data = redline_to_docx(draft.title or "Contract", draft.document or {}, draft.fields or {}, changes)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}-redline.docx"'},
    )


@router.get("/drafts/{draft_id}/export-tracked.docx")
def export_tracked_docx(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Download the draft as a .docx carrying NATIVE Word tracked changes
    (w:ins/w:del) for every pending vendor/reviewer change, so it can be edited
    and accepted/rejected in Word and re-imported (G5)."""
    from fastapi.responses import Response
    from ..models import ChangeType, Disposition, TrackedChange
    from ..services.docx import document_to_docx_tracked
    draft = _get_draft(db, draft_id)
    rows = (
        db.query(TrackedChange)
        .filter(TrackedChange.draft_id == draft_id,
                TrackedChange.disposition == Disposition.PENDING,
                TrackedChange.change_type != ChangeType.COMMENT)
        .order_by(TrackedChange.id)
        .all()
    )
    changes = [{
        "change_type": c.change_type.value, "original_text": c.original_text,
        "proposed_text": c.proposed_text, "author_email": c.author_email,
    } for c in rows]
    data = document_to_docx_tracked(draft.title or "Contract", draft.document or {}, draft.fields or {}, changes)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}-tracked.docx"'},
    )


@router.post("/drafts/{draft_id}/import-tracked")
def import_tracked_docx(draft_id: int, file: UploadFile = File(...), apply: bool = False,
                        db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Re-import a redlined .docx: parse its Word tracked changes into pending
    TrackedChange rows on the draft so they show up in the redline review. With
    apply=true the changes are folded straight into the document (G5)."""
    from ..models import ChangeType, Disposition, TrackedChange
    from ..services.authoring import document_from_text
    from ..services.collaboration import apply_text_suggestion
    from ..services.docx import parse_tracked_changes, tracked_changes_to_records
    from ..services.upload_guard import read_upload

    draft = _get_draft(db, draft_id)
    data = read_upload(file, allowed_exts={".docx"})
    try:
        revisions = parse_tracked_changes(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    records = tracked_changes_to_records(revisions)
    created = []
    for r in records:
        tc = TrackedChange(
            draft_id=draft_id, change_type=ChangeType(r["change_type"]),
            original_text=r["original_text"], proposed_text=r["proposed_text"],
            author_email=r.get("author_email") or (user.email or "reviewer"),
            disposition=Disposition.PENDING, rationale="Imported from redlined .docx",
        )
        db.add(tc)
        created.append(tc)
    db.flush()
    applied = 0
    if apply:
        # Word tracked changes are inline substring edits, so fold them in by
        # find/replace rather than the whole-block matcher used for vendor rounds.
        for tc in created:
            tc.disposition = Disposition.ACCEPTED
            tc.decided_by_id = user.id
            tc.decided_at = datetime.now(timezone.utc)
            did = False
            if tc.change_type == ChangeType.REPLACE and tc.original_text:
                draft.document, did = apply_text_suggestion(draft.document, tc.original_text, tc.proposed_text or "")
            elif tc.change_type == ChangeType.DELETE and tc.original_text:
                draft.document, did = apply_text_suggestion(draft.document, tc.original_text, "")
            elif tc.change_type == ChangeType.INSERT and tc.proposed_text:
                doc = dict(draft.document or {"type": "doc", "content": []})
                doc["content"] = list(doc.get("content") or []) + (document_from_text(tc.proposed_text).get("content") or [])
                draft.document = doc
                did = True
            if did:
                applied += 1
    log_action(db, "contract_draft", draft_id, "IMPORT_TRACKED", user_id=user.id,
               new_value=f"{len(created)} change(s){' applied' if apply else ''}")
    db.commit()
    return {"imported": len(created), "applied": applied,
            "changes": [{"change_type": r["change_type"], "original_text": r["original_text"],
                         "proposed_text": r["proposed_text"], "author_email": r.get("author_email")}
                        for r in records]}


class CommentIn(__import__("pydantic").BaseModel):
    body: str
    block_index: int | None = None
    clause_type: str | None = None


@router.get("/drafts/{draft_id}/comments")
def list_comments(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    from ..models import DraftComment
    _get_draft(db, draft_id)
    rows = (
        db.query(DraftComment).filter(DraftComment.draft_id == draft_id, DraftComment.deleted_at.is_(None))
        .order_by(DraftComment.id).all()
    )
    return [{"id": c.id, "body": c.body, "block_index": c.block_index, "clause_type": c.clause_type,
             "author": c.author.name if c.author else None,
             "created_at": c.created_at.isoformat() if c.created_at else None} for c in rows]


@router.post("/drafts/{draft_id}/comments")
def add_comment(draft_id: int, payload: CommentIn, db: Session = Depends(get_db),
                user: User = Depends(require_author)):
    from ..models import DraftComment
    _get_draft(db, draft_id)
    if not payload.body.strip():
        raise HTTPException(400, "Comment body is required")
    c = DraftComment(draft_id=draft_id, body=payload.body.strip(), block_index=payload.block_index,
                     clause_type=payload.clause_type, author_id=user.id)
    db.add(c); db.flush()
    log_action(db, "contract_draft", draft_id, "COMMENT", user_id=user.id)
    db.commit()
    return {"id": c.id}


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    from ..models import DraftComment
    c = db.get(DraftComment, comment_id)
    if c is None or c.deleted_at is not None:
        raise HTTPException(404, "Comment not found")
    c.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/drafts/{draft_id}/review")
def review_draft(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """AI gap analysis: missing/weak clauses, inconsistencies and a score."""
    from ..services.clauses import analyze_gaps
    draft = _get_draft(db, draft_id)
    return analyze_gaps(db, draft)


@router.get("/drafts/{draft_id}/deviations")
def draft_deviations(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Playbook deviation report (G3/B2): where the draft's clauses sit against
    Legal's standard / fallback / walk-away positions, plus a risk score."""
    from ..services.playbook import analyze_deviations
    draft = _get_draft(db, draft_id)
    return analyze_deviations(db, draft)


# In-process review jobs for async gap analysis with progress (3.1).
_review_jobs: dict[int, dict] = {}


def _run_review_job(draft_id: int) -> None:
    from ..database import SessionLocal
    from ..services.clauses import analyze_gaps
    job = _review_jobs[draft_id]
    db = SessionLocal()
    try:
        job.update(status="running", progress=40)
        draft = db.get(ContractDraft, draft_id)
        result = analyze_gaps(db, draft)
        job.update(status="done", progress=100, result=result, error=None)
    except Exception as exc:  # surface the failure to the poller
        job.update(status="error", progress=100, error=str(exc))
    finally:
        db.close()


@router.post("/drafts/{draft_id}/review-async")
def review_draft_async(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Kick off gap analysis in the background; poll /review-status for the result.
    Large documents (and AI-backed analysis) then don't block the request."""
    import threading
    _get_draft(db, draft_id)
    existing = _review_jobs.get(draft_id)
    if existing and existing.get("status") == "running":
        return {"status": "running", "progress": existing.get("progress", 0)}
    _review_jobs[draft_id] = {"status": "running", "progress": 5, "result": None, "error": None}
    threading.Thread(target=_run_review_job, args=(draft_id,), daemon=True).start()
    return {"status": "running", "progress": 5}


@router.get("/drafts/{draft_id}/review-status")
def review_status(draft_id: int, _: User = Depends(require_viewer)):
    job = _review_jobs.get(draft_id)
    if job is None:
        return {"status": "idle"}
    return {"status": job["status"], "progress": job.get("progress", 0),
            "result": job.get("result"), "error": job.get("error")}


@router.get("/drafts/{draft_id}/references")
def draft_references(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Defined terms and cross-references in the draft, with dangling/unused flags."""
    from ..services import references
    draft = _get_draft(db, draft_id)
    text = authoring.render_text(draft.document, draft.fields or {})
    return references.analyze(draft.document, text)


class InsertClause(__import__("pydantic").BaseModel):
    version_id: int | None = None
    clause_type: str | None = None
    text: str | None = None
    index: int | None = None   # block position; append if omitted


@router.post("/drafts/{draft_id}/insert-clause")
def insert_clause(draft_id: int, payload: InsertClause, db: Session = Depends(get_db),
                  user: User = Depends(require_author)):
    """Insert a clause (from a library version or raw text) as a numbered section
    block, renumbering the document's section headings."""
    from ..models import ClauseVersion
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized and is read-only")

    clause_type = payload.clause_type
    text = payload.text
    version_id = payload.version_id
    if version_id:
        v = db.get(ClauseVersion, version_id)
        if v is None or v.deleted_at is not None:
            raise HTTPException(404, "Clause version not found")
        clause_type = v.entry.clause_type
        text = v.text
        v.usage_count = (v.usage_count or 0) + 1
    if not text:
        raise HTTPException(400, "Nothing to insert")

    doc = draft.document or {"type": "doc", "content": []}
    content = list(doc.get("content", []))
    heading = {"type": "heading", "attrs": {"level": 2},
               "content": [{"type": "text", "text": clause_type or "Clause"}]}
    para = {"type": "paragraph", "content": [{"type": "text", "text": text}],
            "attrs": {"clauseVersionId": version_id, "clauseType": clause_type}}
    at = payload.index if payload.index is not None else len(content)
    at = max(0, min(at, len(content)))
    content[at:at] = [heading, para]
    # Reassign a NEW dict so SQLAlchemy flags the JSON column dirty and persists it.
    draft.document = {**doc, "content": _renumber_sections(content)}
    draft.rev = (draft.rev or 0) + 1

    _snapshot(db, draft, user.id, note=f"insert clause: {clause_type}")
    log_action(db, "contract_draft", draft.id, "INSERT_CLAUSE", user_id=user.id, new_value=clause_type or "")
    db.commit()
    return _draft_out(draft, detail=True)


class SwapClause(__import__("pydantic").BaseModel):
    block_index: int
    version_id: int


@router.post("/drafts/{draft_id}/swap-clause")
def swap_clause(draft_id: int, payload: SwapClause, db: Session = Depends(get_db),
                user: User = Depends(require_author)):
    """Replace a clause block's text with a different library version. Returns the
    old and new text for a redline preview."""
    from ..models import ClauseVersion
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized and is read-only")
    v = db.get(ClauseVersion, payload.version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    doc = draft.document or {"type": "doc", "content": []}
    content = list(doc.get("content", []))
    if not (0 <= payload.block_index < len(content)):
        raise HTTPException(400, "Invalid block index")
    block = content[payload.block_index]
    if block.get("type") != "paragraph":
        raise HTTPException(400, "That block is not a clause paragraph")
    old_text = "".join(t.get("text", "") for t in (block.get("content") or []) if t.get("type") == "text")
    new_block = {
        **block,
        "content": [{"type": "text", "text": v.text}],
        "attrs": {**(block.get("attrs") or {}), "clauseVersionId": v.id, "clauseType": v.entry.clause_type},
    }
    content[payload.block_index] = new_block
    v.usage_count = (v.usage_count or 0) + 1
    # New dict so the JSON column is flagged dirty and persisted.
    draft.document = {**doc, "content": content}
    draft.rev = (draft.rev or 0) + 1
    _snapshot(db, draft, user.id, note=f"swap clause: {v.entry.clause_type} → {v.label}")
    log_action(db, "contract_draft", draft.id, "SWAP_CLAUSE", user_id=user.id, new_value=v.entry.clause_type)
    db.commit()
    return {"draft": _draft_out(draft, detail=True), "old_text": old_text, "new_text": v.text}


def _renumber_sections(content: list[dict]) -> list[dict]:
    """Renumber level-2 section headings as '1. …', '2. …' by document order."""
    import re
    n = 0
    for block in content:
        if block.get("type") == "heading" and (block.get("attrs") or {}).get("level") == 2:
            n += 1
            kids = block.get("content") or [{"type": "text", "text": ""}]
            if kids and kids[0].get("type") == "text":
                bare = re.sub(r"^\s*\d+\.\s*", "", kids[0].get("text", ""))
                kids[0]["text"] = f"{n}. {bare}"
    return content


@router.post("/drafts/{draft_id}/finalize")
def finalize_draft(draft_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Create a register Contract (PENDING_VALIDATION) from the draft so it flows
    through the existing validation → duplicate detection → reminder pipeline.
    Renewal/amendment links join the vendor's renewal chain."""
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, f"Draft already finalized into contract #{draft.contract_id}")

    fields = dict(draft.fields or {})
    authoring.recompute_fields(fields)

    # Resolve the vendor master (attach existing / create), like ingestion does.
    vendor_id = draft.vendor_id
    if not vendor_id and fields.get("vendor"):
        from ..services.extraction_worker import _resolve_or_create_vendor
        vendor_id = _resolve_or_create_vendor(db, fields.get("vendor"))

    contract = Contract(
        status=ContractStatus.PENDING_VALIDATION,
        signing_entity=fields.get("signing_entity"),
        vendor_id=vendor_id,
        vendor_name_raw=fields.get("vendor"),
        vendor_address=fields.get("vendor_address"),
        start_date=_parse_date(fields.get("start_date")),
        end_date=_parse_date(fields.get("end_date")),
        contract_tenure=fields.get("contract_tenure"),
        department_id=draft.department_id,
        po_number=fields.get("po_number"),
        contract_value=fields.get("contract_value"),
        currency=fields.get("currency") or "INR",
        iks_signing_authority=fields.get("iks_signing_authority"),
        vendor_signing_authority=fields.get("vendor_signing_authority"),
        contract_service=fields.get("contract_service"),
        service_summary=fields.get("service_summary"),
        payment_term=fields.get("payment_term"),
        notice_period=fields.get("notice_period"),
        line_items=fields.get("line_items") or [],
        location=fields.get("location"),
        phi_shared=fields.get("phi_shared"),
        contract_type=draft.contract_type or fields.get("contract_type"),
        contract_link=None,
        raw_extracted={"authored": True, "draft_id": draft.id},
        extracted_text=authoring.render_text(draft.document, fields)[:200_000],
        confidence={},
        derived_fields=[],
        extraction_model="authored",
    )
    # Renewal / amendment: join the source contract's renewal thread.
    if draft.link_as in ("renewal", "amendment") and draft.renews_contract_id:
        src = db.get(Contract, draft.renews_contract_id)
        if src is not None:
            contract.renews_contract_id = src.sr_no
            contract.thread_id = src.thread_id or src.sr_no

    db.add(contract)
    db.flush()
    draft.contract_id = contract.sr_no
    _apply_draft_tags_and_attachments(db, draft, contract, fields, user)
    log_action(db, "contract", contract.sr_no, "AUTHORED_FINALIZE", user_id=user.id,
               new_value=f"From authored draft #{draft.id}")
    log_action(db, "contract_draft", draft.id, "FINALIZE", user_id=user.id,
               new_value=f"contract #{contract.sr_no}")
    db.commit()
    return {"contract_id": contract.sr_no, "status": contract.status.value,
            "message": "Draft finalized — complete validation to publish into the register."}


def _apply_draft_tags_and_attachments(db, draft, contract, fields, user) -> None:
    """Carry a draft's tags and attachments onto the finalized contract (3.15)."""
    tag_ids = fields.get("tag_ids") or []
    if isinstance(tag_ids, list) and tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_([int(t) for t in tag_ids if str(t).isdigit()])).all()
        for tag in tags:
            if tag not in contract.tags:
                contract.tags.append(tag)
    atts = (db.query(DraftAttachment)
            .filter(DraftAttachment.draft_id == draft.id, DraftAttachment.deleted_at.is_(None)).all())
    for a in atts:
        db.add(ContractAttachment(
            contract_id=contract.sr_no, filename=a.filename, path=a.path,
            kind=a.kind, size_bytes=a.size_bytes, uploaded_by_id=a.uploaded_by_id,
        ))


# ---------------------------------------------------------------------------
# Vendor collaboration (internal side) — Module D
# ---------------------------------------------------------------------------

from ..schemas import ChangeDecision, ShareCreate  # noqa: E402
from ..services import collaboration as CO  # noqa: E402


def _share_out(link) -> dict:
    valid, reason = CO.link_is_valid(link)
    return {
        "id": link.id, "recipient_email": link.recipient_email, "recipient_name": link.recipient_name,
        "access": link.access.value, "token": link.token,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "due_at": link.due_at.isoformat() if link.due_at else None,
        "revoked": link.revoked_at is not None, "valid": valid, "invalid_reason": reason,
        "opened_at": link.opened_at.isoformat() if link.opened_at else None,
        "open_count": link.open_count, "last_ip": link.last_ip,
        "otp_required": bool(link.otp_code), "otp_verified": link.otp_verified,
        "round_id": link.round_id,
    }


def _change_out(c) -> dict:
    _note, suggestion = CO.risk_commentary({
        "clause_type": c.clause_type, "change_type": c.change_type.value,
        "original_text": c.original_text, "proposed_text": c.proposed_text,
    })
    return {
        "id": c.id, "draft_id": c.draft_id, "round_id": c.round_id,
        "change_type": c.change_type.value, "clause_type": c.clause_type,
        "block_index": c.block_index, "original_text": c.original_text,
        "proposed_text": c.proposed_text, "author_email": c.author_email,
        "rationale": c.rationale, "risk_commentary": c.risk_commentary,
        "suggested_response": suggestion, "disposition": c.disposition.value,
        "disposition_reason": c.disposition_reason, "countered_text": c.countered_text,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.post("/drafts/{draft_id}/internal-review")
def set_internal_review(draft_id: int, reviewed: bool = True,
                        db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Record (or clear) an internal reviewer's sign-off on the current draft."""
    from ..models import utcnow
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized")
    if reviewed:
        draft.internal_reviewed_at = utcnow()
        draft.internal_reviewed_by_id = user.id
    else:
        draft.internal_reviewed_at = None
        draft.internal_reviewed_by_id = None
    log_action(db, "contract_draft", draft.id, "INTERNAL_REVIEW", user_id=user.id,
               new_value="signed off" if reviewed else "cleared")
    db.commit()
    return _draft_out(draft, detail=True)


REVIEWER_ROLES = (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LEGAL, UserRole.APPROVER)


def _email(to: list[str], subject: str, html: str) -> None:
    """Best-effort email via the configured SMTP channel (same path as test mail);
    never lets a mail failure break the request."""
    to = [e for e in (to or []) if e and "@" in e]
    if not to:
        return
    try:
        from ..services.notifications import get_channel
        channel = get_channel("email")
        if channel is not None:
            channel.send(to, subject, html)
    except Exception:
        log.warning("Review email to %s failed", to, exc_info=True)


@router.get("/reviewers")
def list_reviewers(db: Session = Depends(get_db), _: User = Depends(require_author)):
    """Users eligible to be internal reviewers (Legal / Approver / Admin)."""
    rows = (
        db.query(User)
        .filter(User.role.in_(REVIEWER_ROLES), User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )
    return [{"id": u.id, "name": u.name, "role": u.role.value, "email": u.email} for u in rows]


@router.get("/drafts/{draft_id}/review-requests")
def list_review_requests(draft_id: int, db: Session = Depends(get_db),
                         _: User = Depends(require_author)):
    _get_draft(db, draft_id)
    rows = (
        db.query(DraftReviewRequest)
        .filter(DraftReviewRequest.draft_id == draft_id)
        .order_by(DraftReviewRequest.requested_at.desc())
        .all()
    )
    return {"requests": [_review_out(r) for r in rows], "summary": _review_summary(db, draft_id)}


@router.post("/drafts/{draft_id}/review-requests")
def create_review_requests(draft_id: int, payload: dict, db: Session = Depends(get_db),
                           user: User = Depends(require_author)):
    """Send a section (or the whole draft) to one or more internal reviewers.

    Body: {reviewer_ids: [int], excerpt?: str, note?: str}. One request row per
    reviewer. Moves the draft into INTERNAL_REVIEW but never blocks the author —
    they can still share with the vendor while reviews are outstanding."""
    from ..models import utcnow
    from ..services.user_notifications import create_notification
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized")
    reviewer_ids = payload.get("reviewer_ids") or []
    if not reviewer_ids:
        raise HTTPException(400, "Pick at least one reviewer")
    excerpt = (payload.get("excerpt") or "").strip() or None
    note = (payload.get("note") or "").strip() or None

    valid = {
        u.id: u for u in db.query(User).filter(
            User.id.in_(reviewer_ids), User.role.in_(REVIEWER_ROLES)
        ).all()
    }
    created = []
    for rid in reviewer_ids:
        reviewer = valid.get(rid)
        if reviewer is None:
            continue
        req = DraftReviewRequest(
            draft_id=draft.id, reviewer_id=rid, requested_by_id=user.id,
            excerpt=excerpt, note=note, status="pending", requested_at=utcnow(),
        )
        db.add(req)
        created.append(reviewer)
    if not created:
        raise HTTPException(400, "None of the selected users are eligible reviewers (need Legal/Approver/Admin).")

    if draft.status == DraftStatus.DRAFT:
        draft.status = DraftStatus.INTERNAL_REVIEW
    db.flush()
    from ..config import settings
    url = f"{settings.APP_BASE_URL}/authoring/drafts/{draft.id}"
    section_html = (
        f"<p><b>Section under review:</b></p><blockquote>{excerpt}</blockquote>"
        if excerpt else "<p>The whole draft is under review.</p>"
    )
    note_html = f"<p><b>Note from {user.name}:</b> {note}</p>" if note else ""
    body = (
        f"<p>Hi,</p><p><b>{user.name}</b> has asked you to review the contract "
        f"draft <b>“{draft.title}”</b>.</p>{section_html}{note_html}"
        f"<p><a href=\"{url}\">Open the draft to review</a></p>"
        f"<p style=\"color:#888;font-size:12px\">Contract Management System</p>"
    )
    for reviewer in created:
        create_notification(
            db, reviewer.id, "review_request",
            f"You’ve been asked to review “{draft.title}”"
            + (f" — “{excerpt[:60]}…”" if excerpt else ""),
            link=f"/authoring/drafts/{draft.id}",
        )
        _email([reviewer.email], f"Review requested: {draft.title}", body)
    log_action(db, "contract_draft", draft.id, "REVIEW_REQUESTED", user_id=user.id,
               new_value=f"{len(created)} reviewer(s)")
    db.commit()
    return list_review_requests(draft_id, db, user)


@router.post("/review-requests/{request_id}/complete")
def complete_review_request(request_id: int, payload: dict, db: Session = Depends(get_db),
                            user: User = Depends(require_author)):
    """The assigned reviewer records their verdict + comment on their section."""
    from ..models import utcnow
    from ..services.user_notifications import create_notification
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    is_admin = user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if req.reviewer_id != user.id and not is_admin:
        raise HTTPException(403, "Only the assigned reviewer can complete this request")
    outcome = payload.get("outcome")
    if outcome not in ("approved", "changes_requested"):
        raise HTTPException(400, "outcome must be 'approved' or 'changes_requested'")
    req.status = "reviewed"
    req.outcome = outcome
    req.reviewer_comment = (payload.get("comment") or "").strip() or None
    req.suggested_text = (payload.get("suggested_text") or "").strip() or None
    req.reviewed_at = utcnow()
    draft = db.get(ContractDraft, req.draft_id)
    verb = "approved" if outcome == "approved" else "requested changes on"
    if req.requested_by_id:
        create_notification(
            db, req.requested_by_id, "review_done",
            f"{user.name} {verb} a section of “{draft.title if draft else 'a draft'}”",
            link=f"/authoring/drafts/{req.draft_id}",
        )
        requester = db.get(User, req.requested_by_id)
        if requester is not None:
            from ..config import settings
            url = f"{settings.APP_BASE_URL}/authoring/drafts/{req.draft_id}"
            comment_html = f"<p><b>Comment:</b> {req.reviewer_comment}</p>" if req.reviewer_comment else ""
            body = (
                f"<p><b>{user.name}</b> {verb} a section of the draft "
                f"<b>“{draft.title if draft else ''}”</b>.</p>{comment_html}"
                f"<p><a href=\"{url}\">Open the draft</a></p>"
            )
            _email([requester.email], f"Review {outcome.replace('_', ' ')}: {draft.title if draft else 'draft'}", body)
    log_action(db, "contract_draft", req.draft_id, "REVIEW_COMPLETED", user_id=user.id,
               new_value=outcome)
    db.commit()
    return _review_out(req)


@router.delete("/review-requests/{request_id}")
def cancel_review_request(request_id: int, db: Session = Depends(get_db),
                          user: User = Depends(require_author)):
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    db.delete(req)
    log_action(db, "contract_draft", req.draft_id, "REVIEW_CANCELLED", user_id=user.id)
    db.commit()
    return {"ok": True}


def _review_row_out(r: DraftReviewRequest, draft: ContractDraft | None, my_role: str) -> dict:
    out = _review_out(r)
    out["draft_title"] = draft.title if draft else None
    out["draft_finalized"] = bool(draft and draft.contract_id is not None)
    out["my_role"] = my_role  # 'reviewer' | 'author'
    return out


@router.get("/my-reviews")
def my_reviews(db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Every review request the signed-in user is tagged in — as a reviewer (to
    respond to) or as the author who requested it (to accept/reject suggestions).
    Powers the dedicated Reviews screen."""
    as_reviewer = (
        db.query(DraftReviewRequest)
        .filter(DraftReviewRequest.reviewer_id == user.id)
        .order_by(DraftReviewRequest.requested_at.desc())
        .all()
    )
    as_author = (
        db.query(DraftReviewRequest)
        .filter(DraftReviewRequest.requested_by_id == user.id,
                DraftReviewRequest.reviewer_id != user.id)
        .order_by(DraftReviewRequest.requested_at.desc())
        .all()
    )
    draft_ids = {r.draft_id for r in as_reviewer + as_author}
    drafts = {d.id: d for d in db.query(ContractDraft).filter(ContractDraft.id.in_(draft_ids)).all()} if draft_ids else {}
    return {
        "as_reviewer": [_review_row_out(r, drafts.get(r.draft_id), "reviewer") for r in as_reviewer],
        "as_author": [_review_row_out(r, drafts.get(r.draft_id), "author") for r in as_author],
    }


@router.post("/review-requests/{request_id}/accept")
def accept_suggestion(request_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_author)):
    """Author accepts the reviewer's suggested revision: apply it to the draft
    document (replacing the highlighted excerpt) and mark the request resolved."""
    from ..models import utcnow
    from ..services.collaboration import apply_text_suggestion
    from ..services.user_notifications import create_notification
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    draft = db.get(ContractDraft, req.draft_id)
    if draft is None:
        raise HTTPException(404, "Draft not found")
    is_admin = user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if req.requested_by_id not in (user.id, None) and not is_admin:
        raise HTTPException(403, "Only the author who requested the review can accept it")
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized")
    if not req.suggested_text:
        raise HTTPException(400, "This review has no suggested revision to accept")

    applied = False
    if req.excerpt:
        new_doc, applied = apply_text_suggestion(draft.document, req.excerpt, req.suggested_text)
        if applied:
            draft.document = new_doc
            draft.rev = (draft.rev or 0) + 1
    req.resolution = "accepted"
    req.resolved_at = utcnow()
    if req.reviewer_id:
        create_notification(db, req.reviewer_id, "review_accepted",
                            f"{user.name} accepted your suggestion on “{draft.title}”",
                            link=f"/authoring/drafts/{draft.id}")
    log_action(db, "contract_draft", draft.id, "REVIEW_SUGGESTION_ACCEPTED", user_id=user.id,
               new_value=("applied to document" if applied else "excerpt not found — marked accepted"))
    db.commit()
    return {**_review_out(req), "applied_to_document": applied}


@router.post("/review-requests/{request_id}/reject")
def reject_suggestion(request_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_author)):
    """Author rejects the reviewer's suggestion: leave the document unchanged and
    mark the request resolved as rejected."""
    from ..models import utcnow
    from ..services.user_notifications import create_notification
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    is_admin = user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if req.requested_by_id not in (user.id, None) and not is_admin:
        raise HTTPException(403, "Only the author who requested the review can reject it")
    req.resolution = "rejected"
    req.resolved_at = utcnow()
    draft = db.get(ContractDraft, req.draft_id)
    if req.reviewer_id:
        create_notification(db, req.reviewer_id, "review_rejected",
                            f"{user.name} did not apply your suggestion on “{draft.title if draft else 'a draft'}”",
                            link=f"/authoring/drafts/{req.draft_id}")
    log_action(db, "contract_draft", req.draft_id, "REVIEW_SUGGESTION_REJECTED", user_id=user.id)
    db.commit()
    return _review_out(req)


@router.post("/drafts/{draft_id}/reviewer-suggest-inline")
def reviewer_suggest_inline(draft_id: int, payload: dict, db: Session = Depends(get_db),
                            user: User = Depends(require_author)):
    """An internal reviewer submits an edited copy of the whole document; the
    block-level diff against the current draft becomes tracked changes attributed
    to the reviewer — the same suggesting-mode redline vendors get. The author
    then accepts (merges) or rejects each change from the normal changes view."""
    if user.role not in REVIEWER_ROLES:
        raise HTTPException(403, "Only Legal/Approver/Admin reviewers can suggest edits")
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized")
    edited = payload.get("document")
    if not isinstance(edited, dict):
        raise HTTPException(400, "An edited document is required")
    derived = CO.derive_inline_changes(draft.document, edited)
    created = [CO.add_reviewer_change(db, draft, user, c) for c in derived]
    if created and draft.status == DraftStatus.DRAFT:
        draft.status = DraftStatus.INTERNAL_REVIEW
    log_action(db, "contract_draft", draft.id, "REVIEWER_INLINE_SUGGEST", user_id=user.id,
               new_value=f"{len(created)} change(s)")
    db.commit()
    return {"created": len(created),
            "changes": [{"id": c.id, "change_type": c.change_type.value,
                         "clause_type": c.clause_type} for c in created]}


@router.post("/review-requests/{request_id}/messages")
def add_review_message(request_id: int, payload: dict, db: Session = Depends(get_db),
                       user: User = Depends(require_author)):
    """Add a reply to a review-request thread. Either the reviewer or the author
    (or an admin) can reply; the other party is notified."""
    from ..config import settings
    from ..models import utcnow
    from ..services.user_notifications import create_notification
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    is_admin = user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if user.id not in (req.reviewer_id, req.requested_by_id) and not is_admin:
        raise HTTPException(403, "You are not part of this review thread")
    body = (payload.get("body") or "").strip()
    if not body:
        raise HTTPException(400, "Message body is required")
    msg = DraftReviewMessage(review_request_id=req.id, user_id=user.id, body=body, created_at=utcnow())
    db.add(msg)
    draft = db.get(ContractDraft, req.draft_id)
    # @mentions in the reply notify the named users.
    from ..services.user_notifications import notify_mentions
    notify_mentions(db, body, user, f"a review of “{draft.title if draft else 'a draft'}”", link="/reviews")
    # Notify the other participant.
    other = req.requested_by_id if user.id == req.reviewer_id else req.reviewer_id
    if other and other != user.id:
        create_notification(db, other, "review_reply",
                            f"{user.name} replied on the review of “{draft.title if draft else 'a draft'}”",
                            link="/reviews")
        recipient = db.get(User, other)
        if recipient is not None:
            _email([recipient.email], f"New reply on review: {draft.title if draft else 'draft'}",
                   f"<p><b>{user.name}</b> replied:</p><blockquote>{body}</blockquote>"
                   f"<p><a href=\"{settings.APP_BASE_URL}/reviews\">Open Reviews</a></p>")
    log_action(db, "contract_draft", req.draft_id, "REVIEW_REPLY", user_id=user.id)
    db.commit()
    return _review_out(req)


@router.post("/review-requests/{request_id}/resolve")
def resolve_review(request_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_author)):
    """Author closes a review thread without applying a suggestion (Google-Docs
    'Resolve'). Re-opening is possible by the reviewer replying again."""
    from ..models import utcnow
    req = db.get(DraftReviewRequest, request_id)
    if req is None:
        raise HTTPException(404, "Review request not found")
    is_admin = user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    if req.requested_by_id not in (user.id, None) and not is_admin:
        raise HTTPException(403, "Only the author who requested the review can resolve it")
    req.resolution = "resolved"
    req.resolved_at = utcnow()
    log_action(db, "contract_draft", req.draft_id, "REVIEW_RESOLVED", user_id=user.id)
    db.commit()
    return _review_out(req)


@router.post("/drafts/{draft_id}/share")
def share_draft(draft_id: int, payload: ShareCreate, db: Session = Depends(get_db),
                user: User = Depends(require_author)):
    """Open a negotiation round and mint a single-purpose token per recipient."""
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft has been finalized")
    # Optional gate: require internal approval before sharing externally.
    from ..services.settings_store import get_setting
    if get_setting(db, "require_approval_before_share") == "true":
        from .esign_api import _approvals_state
        state = _approvals_state(db, draft)
        if not state["satisfied"]:
            missing = [x["gate"] for x in state["required"] if x["status"] != "APPROVED"]
            raise HTTPException(403, f"Internal approval required before sharing: {', '.join(missing)}")
    # Internal review is advisory, not a gate: the author can send to the vendor
    # even with reviews outstanding (the UI warns first). We surface the pending
    # count so the caller can note it, but never block the share here.
    # `require_internal_review_before_share` is a legacy key that predates this
    # decision and is read by nothing — the admin control that offered it has
    # been removed rather than made to lie about what it does.
    # Sharing a new version supersedes any prior acceptance — the vendor must
    # accept the version they're now seeing before it can go for signature.
    draft.vendor_accepted_at = None
    rnd = CO.create_share(
        db, draft, [r.model_dump() for r in payload.recipients], access=payload.access,
        expires_days=payload.expires_days, due_days=payload.due_days,
        cover_message=payload.cover_message, watermark=payload.watermark,
        allow_download=payload.allow_download, require_otp=payload.require_otp,
        created_by_id=user.id,
    )
    log_action(db, "contract_draft", draft.id, "SHARE_VENDOR", user_id=user.id,
               new_value=f"round {rnd.round_no}: {rnd.shared_with}")
    db.commit()
    from ..models import VendorShareLink
    links = db.query(VendorShareLink).filter(VendorShareLink.round_id == rnd.id).all()
    return {"round_no": rnd.round_no, "links": [_share_out(link) for link in links]}


@router.get("/drafts/{draft_id}/shares")
def list_shares(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    from ..models import VendorShareLink
    _get_draft(db, draft_id)
    rows = (
        db.query(VendorShareLink)
        .filter(VendorShareLink.draft_id == draft_id)
        .order_by(VendorShareLink.id.desc())
        .all()
    )
    return [_share_out(link) for link in rows]


@router.post("/shares/{link_id}/revoke")
def revoke_share(link_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    from ..models import VendorShareLink, utcnow
    link = db.get(VendorShareLink, link_id)
    if link is None:
        raise HTTPException(404, "Share link not found")
    link.revoked_at = utcnow()
    log_action(db, "contract_draft", link.draft_id, "REVOKE_SHARE", user_id=user.id,
               new_value=link.recipient_email)
    db.commit()
    return {"ok": True}


@router.get("/drafts/{draft_id}/changes")
def draft_changes(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    from ..models import TrackedChange
    _get_draft(db, draft_id)
    rows = (
        db.query(TrackedChange)
        .filter(TrackedChange.draft_id == draft_id)
        .order_by(TrackedChange.id)
        .all()
    )
    return [_change_out(c) for c in rows]


@router.get("/drafts/{draft_id}/disposition-history")
def disposition_history(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Append-only history of every disposition decision on the draft's changes (3.13)."""
    from ..models import ChangeDispositionEvent
    _get_draft(db, draft_id)
    rows = (
        db.query(ChangeDispositionEvent)
        .filter(ChangeDispositionEvent.draft_id == draft_id)
        .order_by(ChangeDispositionEvent.id)
        .all()
    )
    return [{"id": e.id, "change_id": e.change_id, "disposition": e.disposition.value,
             "reason": e.reason, "countered_text": e.countered_text,
             "decided_by_id": e.decided_by_id,
             "created_at": e.created_at.isoformat() if e.created_at else None}
            for e in rows]


@router.post("/changes/{change_id}/decide")
def decide_change(change_id: int, payload: ChangeDecision, db: Session = Depends(get_db),
                  user: User = Depends(require_author)):
    from ..models import TrackedChange
    change = db.get(TrackedChange, change_id)
    if change is None:
        raise HTTPException(404, "Change not found")
    if payload.decision == "REJECTED" and not (payload.reason or "").strip():
        raise HTTPException(400, "A reason is required to reject a change")
    CO.decide_change(db, change, payload.decision, payload.reason, payload.countered_text, user.id)
    log_action(db, "contract_draft", change.draft_id, "DECIDE_CHANGE", user_id=user.id,
               field=change.clause_type, new_value=payload.decision)
    db.commit()
    return _change_out(change)


class BulkDecision(__import__("pydantic").BaseModel):
    change_ids: list[int]
    decision: str
    reason: str | None = None
    countered_text: str | None = None


@router.post("/changes/bulk-decide")
def bulk_decide(payload: BulkDecision, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Accept/reject/counter several tracked changes at once."""
    from ..models import TrackedChange
    if payload.decision == "REJECTED" and not (payload.reason or "").strip():
        raise HTTPException(400, "A reason is required to reject")
    updated = 0
    for cid in payload.change_ids:
        change = db.get(TrackedChange, cid)
        if change is None:
            continue
        CO.decide_change(db, change, payload.decision, payload.reason, payload.countered_text, user.id)
        updated += 1
    db.commit()
    return {"updated": updated, "decision": payload.decision}


@router.get("/insights/most-challenged")
def most_challenged_clauses(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Cross‑vendor: which clause types are challenged/rejected most often — shown
    in the clause library to spot systematically contentious clauses."""
    from ..models import ChangeType, Disposition, TrackedChange
    rows = (
        db.query(TrackedChange)
        .filter(TrackedChange.change_type != ChangeType.COMMENT)
        .all()
    )
    by: dict[str, dict] = {}
    for c in rows:
        b = by.setdefault(c.clause_type or "Other", {"challenged": 0, "accepted": 0, "rejected": 0})
        b["challenged"] += 1
        if c.disposition == Disposition.ACCEPTED:
            b["accepted"] += 1
        elif c.disposition == Disposition.REJECTED:
            b["rejected"] += 1
    out = [{"clause_type": k, **v} for k, v in by.items()]
    out.sort(key=lambda r: -r["challenged"])
    return out


def _ledger_data(db, draft_id, clause_type=None, disposition=None, vendor=None):
    from ..models import NegotiationRound, TrackedChange
    rounds = (
        db.query(NegotiationRound).filter(NegotiationRound.draft_id == draft_id)
        .order_by(NegotiationRound.round_no).all()
    )
    q = db.query(TrackedChange).filter(TrackedChange.draft_id == draft_id)
    if clause_type:
        q = q.filter(TrackedChange.clause_type == clause_type)
    if disposition:
        from ..models import Disposition
        q = q.filter(TrackedChange.disposition == Disposition(disposition))
    if vendor:
        q = q.filter(TrackedChange.author_email.ilike(f"%{vendor}%"))
    changes = q.order_by(TrackedChange.id).all()
    by_round: dict = {}
    for c in changes:
        by_round.setdefault(c.round_id, []).append(_change_out(c))
    return rounds, by_round, changes


@router.get("/drafts/{draft_id}/ledger")
def negotiation_ledger(
    draft_id: int, clause_type: str | None = None, disposition: str | None = None,
    vendor: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_viewer),
):
    """Immutable record of every round + proposed change and its disposition.
    Filterable by clause type, disposition and vendor (author email)."""
    _get_draft(db, draft_id)
    rounds, by_round, _changes = _ledger_data(db, draft_id, clause_type, disposition, vendor)
    return {
        "rounds": [
            {"round_no": r.round_no, "shared_with": r.shared_with, "status": r.status.value,
             "shared_at": r.shared_at.isoformat() if r.shared_at else None,
             "returned_at": r.returned_at.isoformat() if r.returned_at else None,
             "changes": by_round.get(r.id, [])}
            for r in rounds
        ],
    }


@router.get("/drafts/{draft_id}/ledger.xlsx")
def ledger_xlsx(draft_id: int, clause_type: str | None = None, disposition: str | None = None,
                vendor: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Export the (filtered) negotiation ledger to Excel."""
    import io
    from fastapi.responses import Response
    from openpyxl import Workbook
    _get_draft(db, draft_id)
    rounds, _by, changes = _ledger_data(db, draft_id, clause_type, disposition, vendor)
    round_no = {r.id: r.round_no for r in rounds}
    wb = Workbook()
    ws = wb.active
    ws.title = "Negotiation ledger"
    ws.append(["Round", "Clause type", "Change", "Vendor", "Original", "Proposed",
               "Disposition", "Reason", "Counter", "Decided at"])
    for c in changes:
        ws.append([round_no.get(c.round_id), c.clause_type, c.change_type.value, c.author_email,
                   c.original_text, c.proposed_text, c.disposition.value, c.disposition_reason,
                   c.countered_text, c.decided_at.isoformat() if c.decided_at else None])
    buf = io.BytesIO(); wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}-ledger.xlsx"'},
    )


@router.get("/drafts/{draft_id}/ledger.pdf")
def ledger_pdf(draft_id: int, clause_type: str | None = None, disposition: str | None = None,
               vendor: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Export the (filtered) negotiation ledger to PDF."""
    from fastapi.responses import Response
    from ..services.pdf import text_to_pdf
    draft = _get_draft(db, draft_id)
    rounds, _by, changes = _ledger_data(db, draft_id, clause_type, disposition, vendor)
    round_no = {r.id: r.round_no for r in rounds}
    lines = []
    for c in changes:
        lines.append(f"[R{round_no.get(c.round_id)}] {c.clause_type or 'General'} — {c.change_type.value} "
                     f"[{c.disposition.value}] by {c.author_email or 'vendor'}")
        if c.original_text:
            lines.append(f"    original: {c.original_text}")
        if c.proposed_text:
            lines.append(f"    proposed: {c.proposed_text}")
        if c.disposition_reason:
            lines.append(f"    reason: {c.disposition_reason}")
        lines.append("")
    data = text_to_pdf(f"NEGOTIATION LEDGER — {draft.title}", "\n".join(lines) or "No changes recorded.")
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="draft-{draft_id}-ledger.pdf"'})


@router.get("/inbox")
def redline_inbox(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Drafts with vendor-returned rounds or undecided changes."""
    from ..models import ContractDraft, Disposition, NegotiationRound, RoundStatus, TrackedChange
    returned = (
        db.query(NegotiationRound)
        .filter(NegotiationRound.status == RoundStatus.RETURNED)
        .all()
    )
    draft_ids = {r.draft_id for r in returned}
    pending_counts = dict(
        db.query(TrackedChange.draft_id, __import__("sqlalchemy").func.count(TrackedChange.id))
        .filter(TrackedChange.disposition == Disposition.PENDING)
        .group_by(TrackedChange.draft_id)
        .all()
    )
    draft_ids |= set(pending_counts.keys())
    out = []
    for did in draft_ids:
        d = db.get(ContractDraft, did)
        if d is None or d.deleted_at is not None:
            continue
        out.append({
            "draft_id": did, "title": d.title, "status": d.status.value,
            "vendor_name": d.vendor.name if d.vendor else (d.fields or {}).get("vendor"),
            "pending_changes": pending_counts.get(did, 0),
        })
    return out


@router.post("/drafts/{draft_id}/notify-vendor")
def notify_vendor(draft_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Email the vendor an itemized disposition summary with a fresh tokenized
    link to the updated draft."""
    from ..models import Disposition, NegotiationRound, TrackedChange, VendorShareLink
    draft = _get_draft(db, draft_id)
    last = (
        db.query(NegotiationRound).filter(NegotiationRound.draft_id == draft_id)
        .order_by(NegotiationRound.round_no.desc()).first()
    )
    if last is None:
        raise HTTPException(400, "Nothing has been shared yet")
    recipients = [{"email": e.strip()} for e in (last.shared_with or "").split(",") if e.strip()]
    if not recipients:
        raise HTTPException(400, "No recipients to notify")
    decided = (
        db.query(TrackedChange).filter(TrackedChange.draft_id == draft_id)
        .filter(TrackedChange.disposition != Disposition.PENDING).all()
    )
    summary = {"ACCEPTED": [], "REJECTED": [], "COUNTERED": []}
    for c in decided:
        summary.setdefault(c.disposition.value, []).append(c.clause_type or "clause")
    # Fresh round + link (invalidates prior tokens)
    rnd = CO.create_share(db, draft, recipients, access="SUGGEST", created_by_id=user.id,
                          cover_message="Updated draft with our responses to your changes.")
    links = db.query(VendorShareLink).filter(VendorShareLink.round_id == rnd.id).all()
    _send_disposition_emails(db, links, summary)
    log_action(db, "contract_draft", draft_id, "NOTIFY_VENDOR", user_id=user.id,
               new_value=f"round {rnd.round_no}")
    db.commit()
    return {"round_no": rnd.round_no, "links": [_share_out(link) for link in links],
            "summary": {k: len(v) for k, v in summary.items()}}


def _send_disposition_emails(db, links, summary) -> None:
    from ..config import settings
    from ..services.notifications import get_channel
    from ..services.email_templates import render_named
    channel = get_channel("email")
    if channel is None:
        return
    parts = ["<ul>"]
    for disp in ("ACCEPTED", "REJECTED", "COUNTERED"):
        items = summary.get(disp, [])
        if items:
            parts.append(f"<li><b>{disp.title()}</b>: {', '.join(items)}</li>")
    parts.append("</ul>")
    summary_html = "".join(parts)
    for link in links:
        url = f"{settings.APP_BASE_URL}/vendor/{link.token}"
        subject, body = render_named(db, "vendor_disposition", {
            "summary_html": summary_html, "url": url, "vendor_email": link.recipient_email,
        })
        try:
            channel.send([link.recipient_email], subject, body)
        except Exception:  # best-effort
            pass


@router.get("/vendors/{vendor_id}/insights")
def vendor_insights(vendor_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Cross-contract negotiation insights for a vendor."""
    return CO.negotiation_insights(db, vendor_id)
