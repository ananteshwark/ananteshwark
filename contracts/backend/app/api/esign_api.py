"""E-signature (Module E) + approval gates (Module F).

Send-for-signature freezes the draft, renders the final PDF, and creates an
envelope through the provider-agnostic layer. Provider webhooks drive status;
on completion the signed PDF is attached and the record is pushed into the
register (validated → duplicate detection → reminders), exactly like an
ingested contract.
"""
import logging
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_author, require_viewer
from ..config import settings
from ..database import get_db
from ..models import (
    Approval,
    ApprovalStatus,
    Contract,
    ContractDraft,
    ContractStatus,
    DraftStatus,
    EnvelopeEvent,
    EnvelopeStatus,
    ESignEnvelope,
    LifecycleStatus,
    User,
    utcnow,
)
from ..services import esign as ES
from ..services.settings_store import get_setting

log = logging.getLogger(__name__)
router = APIRouter(prefix="/esign", tags=["esign"])


class Signer(BaseModel):
    name: str
    email: str
    role: str = "Signer"
    order: int = 1
    anchor: str | None = None
    date_anchor: str | None = None


class SendRequest(BaseModel):
    subject: str | None = None
    signers: list[Signer]
    # 2.7: DocuSign delivery options.
    reminder_enabled: bool = True
    reminder_delay_days: int = 3      # days after send before first reminder
    reminder_frequency_days: int = 3  # days between reminders
    expire_days: int = 30             # envelope voids after this many days
    template_id: str | None = None    # optional DocuSign server template


class CorrectRequest(BaseModel):
    expire_days: int | None = None
    reminder_enabled: bool | None = None
    reminder_frequency_days: int | None = None


class ApprovalDecision(BaseModel):
    status: str          # APPROVED | REJECTED
    reason: str | None = None


def _get_draft(db, draft_id) -> ContractDraft:
    d = db.get(ContractDraft, draft_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Draft not found")
    return d


# ---------------------------------------------------------------------------
# Approval gates (Module F)
# ---------------------------------------------------------------------------

def _stage_role(name: str):
    """Map an approver-role name to a UserRole; default to APPROVER."""
    from ..models import UserRole
    try:
        return UserRole(name)
    except (ValueError, TypeError):
        return UserRole.APPROVER


def _condition_applies(cond: dict, draft: ContractDraft) -> bool:
    """Does this stage's condition apply to the draft?"""
    ctype = (cond or {}).get("type", "always")
    val = (cond or {}).get("value")
    if ctype == "always":
        return True
    if ctype == "value_gte":
        try:
            return float((draft.fields or {}).get("contract_value") or 0) >= float(val or 0)
        except (TypeError, ValueError):
            return False
    if ctype == "contract_type":
        return (draft.contract_type or (draft.fields or {}).get("contract_type")) == val
    if ctype == "department":
        try:
            return draft.department_id == int(val)
        except (TypeError, ValueError):
            return False
    return False


def _policy_stages(db) -> list[dict] | None:
    """Parse the configurable approval policy setting, or None if unset/invalid."""
    import json
    raw = get_setting(db, "approval_policy")
    if not raw or not raw.strip():
        return None
    try:
        stages = json.loads(raw)
        return stages if isinstance(stages, list) and stages else None
    except (ValueError, TypeError):
        return None


def required_stages(db, draft: ContractDraft) -> list[dict]:
    """The ordered approval stages that apply to this draft.

    Uses the configurable `approval_policy` when set (conditional, ordered,
    role-based stages); otherwise falls back to the legacy legal/finance gates
    (with per-department overrides) so existing installs behave unchanged.
    """
    policy = _policy_stages(db)
    if policy is not None:
        stages = []
        for i, s in enumerate(policy):
            if not isinstance(s, dict):
                continue
            if _condition_applies(s.get("condition") or {"type": "always"}, draft):
                stages.append({
                    "key": s.get("key") or f"stage{i+1}",
                    "name": s.get("name") or (s.get("key") or f"Stage {i+1}"),
                    "approver_role": (s.get("approver_role") or "APPROVER").upper(),
                    "order": int(s.get("order", i + 1)),
                    "sla_days": s.get("sla_days"),
                })
        stages.sort(key=lambda s: s["order"])
        return stages

    # ---- Legacy fallback: legal + finance gates from settings/department ----
    from ..models import Department
    dept = db.get(Department, draft.department_id) if draft.department_id else None
    if dept is not None and dept.approval_require_legal is not None:
        require_legal = bool(dept.approval_require_legal)
    else:
        require_legal = get_setting(db, "approval_require_legal") == "true"
    if dept is not None and dept.approval_value_threshold is not None:
        threshold = float(dept.approval_value_threshold)
    else:
        try:
            threshold = float(get_setting(db, "approval_value_threshold") or 0)
        except ValueError:
            threshold = 0
    stages = []
    if require_legal:
        stages.append({"key": "legal", "name": "Legal review", "approver_role": "LEGAL", "order": 1, "sla_days": None})
    value = (draft.fields or {}).get("contract_value")
    if threshold and value is not None:
        try:
            if float(value) >= threshold:
                stages.append({"key": "finance", "name": "Finance sign-off", "approver_role": "APPROVER", "order": 2, "sla_days": None})
        except (TypeError, ValueError):
            pass
    return stages


def required_gates(db, draft: ContractDraft) -> list[str]:
    """Backward-compatible list of gate keys (derived from the stage policy)."""
    return [s["key"] for s in required_stages(db, draft)]


def _approvals_state(db, draft: ContractDraft) -> dict:
    stages = required_stages(db, draft)
    rows = db.query(Approval).filter(Approval.draft_id == draft.id).all()
    by_gate = {a.gate: a for a in rows}
    out = []
    prior_all_approved = True  # sequential: a stage is active only once lower orders pass
    last_order = None
    for s in stages:
        a = by_gate.get(s["key"])
        status = a.status.value if a else "PENDING"
        # New order band starts: recompute whether everything before it is approved.
        if last_order is not None and s["order"] > last_order:
            prior_all_approved = all(
                (by_gate.get(x["key"]).status.value if by_gate.get(x["key"]) else "PENDING") == "APPROVED"
                for x in stages if x["order"] < s["order"]
            )
        last_order = s["order"]
        out.append({
            "gate": s["key"], "name": s["name"], "order": s["order"],
            "approver_role": s["approver_role"], "sla_days": s.get("sla_days"),
            "status": status, "approval_id": a.id if a else None,
            "reason": a.reason if a else None,
            "requested": a is not None,
            "active": prior_all_approved,  # can be decided now (sequential)
        })
    satisfied = all(x["status"] == "APPROVED" for x in out)
    return {"required": out, "satisfied": satisfied}


@router.get("/drafts/{draft_id}/approvals")
def get_approvals(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return _approvals_state(db, _get_draft(db, draft_id))


@router.post("/drafts/{draft_id}/request-approval")
def request_approval(draft_id: int, gate: str, db: Session = Depends(get_db),
                     user: User = Depends(require_author)):
    draft = _get_draft(db, draft_id)
    existing = db.query(Approval).filter(Approval.draft_id == draft_id, Approval.gate == gate).first()
    if existing and existing.status == ApprovalStatus.PENDING:
        return {"approval_id": existing.id, "status": existing.status.value}
    appr = Approval(draft_id=draft_id, gate=gate, status=ApprovalStatus.PENDING)
    db.add(appr)
    db.flush()
    _notify_approvers(db, draft, gate, requested_by=user)
    log_action(db, "contract_draft", draft_id, "REQUEST_APPROVAL", user_id=user.id, new_value=gate)
    db.commit()
    return {"approval_id": appr.id, "status": "PENDING"}


def _notify_approvers(db, draft: ContractDraft, gate: str, requested_by: User,
                      role_name: str | None = None) -> None:
    """In-app + email notify the users who can decide this gate. The stage's
    approver role (or, legacy, Legal for the legal gate / Approver otherwise) plus
    Admins are notified."""
    from ..models import UserRole
    from ..services.user_notifications import create_notification

    if role_name:
        roles = [UserRole.ADMIN, _stage_role(role_name)]
    else:
        roles = [UserRole.ADMIN, UserRole.LEGAL] if gate == "legal" else [UserRole.ADMIN, UserRole.APPROVER]
    approvers = (
        db.query(User)
        .filter(User.role.in_(roles), User.is_active.is_(True), User.deleted_at.is_(None))
        .all()
    )
    link = f"/authoring/drafts/{draft.id}"
    msg = (f"{gate.title()} approval requested for draft #{draft.id} “{draft.title}” "
           f"by {requested_by.name}")
    recipients = []
    for u in approvers:
        if u.id == requested_by.id:
            continue
        create_notification(db, u.id, "approval", msg, link)
        if u.email:
            recipients.append(u)
    for u in recipients:
        try:
            from ..config import settings
            from ..services.notifications import get_channel
            from ..services.email_templates import render_named
            channel = get_channel("email")
            if channel is None:
                break
            url = f"{settings.APP_BASE_URL}{link}"
            subject, body = render_named(db, "approval_request", {
                "gate": gate.title(), "draft_id": draft.id, "draft_title": draft.title,
                "requested_by": requested_by.name, "message": msg, "url": url,
            })
            # H4: a per-approver single-use link so the decision can be made from
            # the email, without signing in.
            try:
                from .approval_action_api import issue_token
                token = issue_token(db, draft.id, gate, u)
                base = f"{settings.APP_BASE_URL}/approve/{token}"
                body += (f"\n\nDecide without signing in:\n"
                         f"  Approve: {base}?d=approve\n"
                         f"  Reject:  {base}?d=reject\n"
                         f"(This link works once and expires in 14 days.)")
            except Exception:
                # The email still goes out, just without the one-click decide
                # links — which reads to the approver as a broken email.
                log.warning("Could not mint an approval magic link for %s on draft %s "
                            "gate %s; sending the email without it",
                            u.email, draft.id, gate, exc_info=True)
            channel.send([u.email], subject, body)
        except Exception:  # best-effort
            log.warning("Approval request email to %s failed for draft %s gate %s",
                        u.email, draft.id, gate, exc_info=True)


@router.post("/drafts/{draft_id}/request-approvals")
def request_all_approvals(draft_id: int, db: Session = Depends(get_db),
                          user: User = Depends(require_author)):
    """Kick off every approval stage that applies to this draft (creating the ones
    that don't exist yet) and notify each stage's approver role."""
    draft = _get_draft(db, draft_id)
    stages = required_stages(db, draft)
    existing = {a.gate for a in db.query(Approval).filter(Approval.draft_id == draft_id).all()}
    created = 0
    for s in stages:
        if s["key"] in existing:
            continue
        db.add(Approval(draft_id=draft_id, gate=s["key"], status=ApprovalStatus.PENDING))
        db.flush()
        _notify_approvers(db, draft, s["key"], requested_by=user, role_name=s["approver_role"])
        created += 1
    if created:
        log_action(db, "contract_draft", draft_id, "REQUEST_APPROVALS", user_id=user.id,
                   new_value=f"{created} stage(s)")
    db.commit()
    return _approvals_state(db, draft)


@router.post("/approvals/{approval_id}/decide")
def decide_approval(approval_id: int, payload: ApprovalDecision, db: Session = Depends(get_db),
                    user: User = Depends(require_author)):
    appr = db.get(Approval, approval_id)
    if appr is None:
        raise HTTPException(404, "Approval not found")
    if payload.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "status must be APPROVED or REJECTED")
    from ..models import UserRole
    from ..auth import user_roles
    draft0 = db.get(ContractDraft, appr.draft_id)
    # Find this gate's stage in the (policy or legacy) approval workflow to get its
    # required approver role and whether it's active yet under sequential ordering.
    stage = next((s for s in _approvals_state(db, draft0)["required"] if s["gate"] == appr.gate), None) if draft0 else None
    role_name = (stage or {}).get("approver_role", "APPROVER")
    allowed = {UserRole.ADMIN, UserRole.SUPER_ADMIN, _stage_role(role_name)}
    if user_roles(user).isdisjoint(allowed):
        raise HTTPException(403, f"The “{(stage or {}).get('name', appr.gate)}” approval must be "
                                 f"decided by {role_name.title()} (or an admin).")
    if payload.status == "APPROVED" and stage is not None and not stage.get("active", True):
        raise HTTPException(409, "An earlier approval stage is still pending — approve those first.")
    appr.status = ApprovalStatus(payload.status)
    appr.approver_id = user.id
    appr.reason = payload.reason
    appr.decided_at = utcnow()
    draft = db.get(ContractDraft, appr.draft_id)
    if draft and payload.status == "APPROVED":
        state = _approvals_state(db, draft)
        if state["satisfied"] and draft.status in (DraftStatus.NEGOTIATION, DraftStatus.INTERNAL_REVIEW, DraftStatus.DRAFT):
            draft.status = DraftStatus.INTERNAL_APPROVED
    log_action(db, "contract_draft", appr.draft_id, "DECIDE_APPROVAL", user_id=user.id,
               field=appr.gate, new_value=payload.status)
    db.commit()
    return {"approval_id": appr.id, "status": appr.status.value}


def _record_decision(db, draft_id: int, stage_key: str, user: User,
                     decision: str, note: str | None) -> dict:
    """Apply an approval decision on behalf of `user` for one stage (H4).

    Shared by the in-app endpoint and the one-tap email link so both paths go
    through the same role check, sequencing rule and status transition.
    """
    draft = db.get(ContractDraft, draft_id)
    if draft is None or draft.deleted_at is not None:
        raise HTTPException(404, "Draft not found")
    appr = (
        db.query(Approval)
        .filter(Approval.draft_id == draft_id, Approval.gate == stage_key)
        .order_by(Approval.id.desc())
        .first()
    )
    if appr is None:
        raise HTTPException(404, f"No “{stage_key}” approval is pending on this draft")
    if appr.status != ApprovalStatus.PENDING:
        raise HTTPException(409, f"This approval was already {appr.status.value.lower()}")

    from ..auth import user_roles
    from ..models import UserRole
    stage = next((s for s in _approvals_state(db, draft)["required"]
                  if s["gate"] == stage_key), None)
    role_name = (stage or {}).get("approver_role", "APPROVER")
    allowed = {UserRole.ADMIN, UserRole.SUPER_ADMIN, _stage_role(role_name)}
    if user_roles(user).isdisjoint(allowed):
        raise HTTPException(403, f"The “{(stage or {}).get('name', stage_key)}” approval must be "
                                 f"decided by {role_name.title()} (or an admin).")
    if decision == "APPROVED" and stage is not None and not stage.get("active", True):
        raise HTTPException(409, "An earlier approval stage is still pending — approve those first.")

    appr.status = ApprovalStatus(decision)
    appr.approver_id = user.id
    appr.reason = note
    appr.decided_at = utcnow()
    if decision == "APPROVED":
        state = _approvals_state(db, draft)
        if state["satisfied"] and draft.status in (
                DraftStatus.NEGOTIATION, DraftStatus.INTERNAL_REVIEW, DraftStatus.DRAFT):
            draft.status = DraftStatus.INTERNAL_APPROVED
    return {"approval_id": appr.id, "status": appr.status.value,
            "draft_status": draft.status.value}


# ---------------------------------------------------------------------------
# Send for signature
# ---------------------------------------------------------------------------

def _envelope_out(e: ESignEnvelope) -> dict:
    return {
        "id": e.id, "draft_id": e.draft_id, "contract_id": e.contract_id, "provider": e.provider,
        "external_id": e.external_id, "status": e.status.value, "subject": e.subject,
        "signers": e.signers or [], "void_reason": e.void_reason,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
        "signed_pdf": bool(e.signed_pdf_path),
        "certificate": bool(e.certificate_path),
        "options": e.options or {},
        "events": [
            {"event_type": ev.event_type, "recipient": ev.recipient, "status": ev.status,
             "detail": ev.detail, "occurred_at": ev.occurred_at.isoformat() if ev.occurred_at else None}
            for ev in e.events
        ],
    }


@router.post("/drafts/{draft_id}/send")
def send_for_signature(draft_id: int, payload: SendRequest, db: Session = Depends(get_db),
                       user: User = Depends(require_author)):
    draft = _get_draft(db, draft_id)
    if draft.contract_id is not None:
        raise HTTPException(409, "Draft is already executed")
    existing = (
        db.query(ESignEnvelope).filter(ESignEnvelope.draft_id == draft_id)
        .filter(ESignEnvelope.status.notin_([EnvelopeStatus.VOIDED, EnvelopeStatus.DECLINED])).first()
    )
    if existing:
        raise HTTPException(409, "An active envelope already exists for this draft")

    state = _approvals_state(db, draft)
    if not state["satisfied"]:
        missing = [x["gate"] for x in state["required"] if x["status"] != "APPROVED"]
        raise HTTPException(403, f"Required approval(s) not granted: {', '.join(missing)}")

    # If the draft was shared with a vendor for review, they must have accepted
    # the current version before it can go out for signature.
    from ..models import VendorShareLink
    was_shared = db.query(VendorShareLink).filter(VendorShareLink.draft_id == draft_id).first() is not None
    if was_shared and draft.vendor_accepted_at is None:
        raise HTTPException(403, "The vendor has not yet accepted this version. Ask them to accept it "
                                 "on their review link (or re-share the latest version) before sending.")

    # Freeze the draft
    draft.status = DraftStatus.OUT_FOR_SIGNATURE

    # Default anchors per signer from the register signing authorities.
    signers = []
    for i, s in enumerate(payload.signers, start=1):
        signers.append({
            "name": s.name, "email": s.email, "role": s.role, "order": s.order or i,
            "anchor": s.anchor or f"/sig{i}/", "date_anchor": s.date_anchor or f"/date{i}/",
        })

    pdf_bytes = ES.build_final_pdf(draft, signers, db=db)
    doc_dir = Path(getattr(settings, "MANUAL_UPLOAD_DIR", "./manual_uploads")) / "esign"
    doc_dir.mkdir(parents=True, exist_ok=True)
    doc_path = doc_dir / f"draft-{draft_id}-final.pdf"
    doc_path.write_bytes(pdf_bytes)

    provider = ES.get_provider(db)
    subject = payload.subject or f"Signature request: {draft.title}"
    options = {
        "reminder_enabled": payload.reminder_enabled,
        "reminder_delay_days": max(0, payload.reminder_delay_days),
        "reminder_frequency_days": max(1, payload.reminder_frequency_days),
        "expire_days": max(1, payload.expire_days),
        "template_id": payload.template_id or None,
    }
    try:
        external_id = provider.create_envelope(subject, pdf_bytes, signers, options=options)
    except ES.ESignError as exc:
        draft.status = DraftStatus.INTERNAL_APPROVED
        db.commit()
        raise HTTPException(502, str(exc))

    env = ESignEnvelope(
        draft_id=draft_id, provider=provider.name, external_id=external_id,
        status=EnvelopeStatus.SENT, subject=subject, signers=signers, options=options,
        document_pdf_path=str(doc_path.resolve()), created_by_id=user.id,
    )
    db.add(env)
    db.flush()
    db.add(EnvelopeEvent(envelope_id=env.id, event_type="sent", status="SENT",
                         detail=f"Envelope created via {provider.name}"))
    log_action(db, "contract_draft", draft_id, "SEND_FOR_SIGNATURE", user_id=user.id,
               new_value=f"{provider.name}:{external_id}")
    db.commit()
    return _envelope_out(env)


@router.get("/drafts/{draft_id}/envelope")
def draft_envelope(draft_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    e = (db.query(ESignEnvelope).filter(ESignEnvelope.draft_id == draft_id)
         .order_by(ESignEnvelope.id.desc()).first())
    if e is None:
        return None
    return _envelope_out(e)


@router.get("/envelopes")
def list_envelopes(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = db.query(ESignEnvelope).order_by(ESignEnvelope.id.desc()).limit(200).all()
    return [_envelope_out(e) for e in rows]


def _envelope_file(db, env_id, path_attr, label):
    from fastapi.responses import FileResponse
    e = db.get(ESignEnvelope, env_id)
    if e is None:
        raise HTTPException(404, "Envelope not found")
    path = getattr(e, path_attr)
    if not path or not Path(path).exists():
        raise HTTPException(404, f"No {label} available for this envelope")
    return FileResponse(path, media_type="application/pdf",
                        filename=f"envelope-{env_id}-{label}.pdf")


@router.get("/envelopes/{env_id}/signed.pdf")
def download_signed_pdf(env_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return _envelope_file(db, env_id, "signed_pdf_path", "signed")


@router.get("/envelopes/{env_id}/certificate.pdf")
def download_certificate(env_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """The Certificate of Completion (audit trail) for a completed envelope."""
    return _envelope_file(db, env_id, "certificate_path", "certificate")


@router.post("/envelopes/{env_id}/void")
def void_envelope(env_id: int, reason: str, db: Session = Depends(get_db),
                  user: User = Depends(require_author)):
    e = db.get(ESignEnvelope, env_id)
    if e is None:
        raise HTTPException(404, "Envelope not found")
    try:
        ES.get_provider(db).void_envelope(e.external_id, reason)
    except ES.ESignError as exc:
        raise HTTPException(502, str(exc))
    e.status = EnvelopeStatus.VOIDED
    e.void_reason = reason
    db.add(EnvelopeEvent(envelope_id=e.id, event_type="voided", status="VOIDED", detail=reason))
    draft = db.get(ContractDraft, e.draft_id)
    if draft and draft.contract_id is None:
        draft.status = DraftStatus.INTERNAL_APPROVED
    log_action(db, "contract_draft", e.draft_id, "VOID_ENVELOPE", user_id=user.id, new_value=reason)
    db.commit()
    return _envelope_out(e)


@router.post("/envelopes/{env_id}/resend")
def resend_envelope(env_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    e = db.get(ESignEnvelope, env_id)
    if e is None:
        raise HTTPException(404, "Envelope not found")
    try:
        ES.get_provider(db).resend(e.external_id)
    except ES.ESignError as exc:
        raise HTTPException(502, str(exc))
    db.add(EnvelopeEvent(envelope_id=e.id, event_type="resent", status=e.status.value))
    db.commit()
    return {"ok": True}


@router.post("/envelopes/{env_id}/correct")
def correct_envelope(env_id: int, payload: CorrectRequest, db: Session = Depends(get_db),
                     user: User = Depends(require_author)):
    """Modify an in-flight envelope's reminders/expiration (DocuSign 'correct')."""
    e = db.get(ESignEnvelope, env_id)
    if e is None:
        raise HTTPException(404, "Envelope not found")
    if e.status in (EnvelopeStatus.COMPLETED, EnvelopeStatus.VOIDED, EnvelopeStatus.DECLINED):
        raise HTTPException(409, f"Envelope is {e.status.value}; cannot correct")
    opts = dict(e.options or {})
    if payload.expire_days is not None:
        opts["expire_days"] = max(1, payload.expire_days)
    if payload.reminder_enabled is not None:
        opts["reminder_enabled"] = payload.reminder_enabled
    if payload.reminder_frequency_days is not None:
        opts["reminder_frequency_days"] = max(1, payload.reminder_frequency_days)
    try:
        ES.get_provider(db).correct(e.external_id, opts)
    except ES.ESignError as exc:
        raise HTTPException(502, str(exc))
    e.options = opts
    db.add(EnvelopeEvent(envelope_id=e.id, event_type="corrected", status=e.status.value,
                         detail="reminders/expiration updated"))
    log_action(db, "contract_draft", e.draft_id, "CORRECT_ENVELOPE", user_id=user.id)
    db.commit()
    return _envelope_out(e)


# ---------------------------------------------------------------------------
# Provider webhook (public) — drives status transitions
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def esign_webhook(request: Request, db: Session = Depends(get_db)):
    """Receive a provider webhook.

    This is the only async route in the app; every other endpoint is a sync
    `def`, which Starlette runs in a threadpool. Handling the webhook inline
    here meant its synchronous SQLAlchemy queries — and, on completion, a
    synchronous download of the signed PDF from the provider — occupied the
    event loop for their whole duration, stalling every concurrent request.

    Only the body read is awaited; the blocking work is handed to the same
    threadpool the rest of the app already uses.
    """
    body = await request.body()
    return await run_in_threadpool(_process_webhook, db, body, request.headers)


def _process_webhook(db: Session, body: bytes, headers) -> dict:
    if not ES.verify_webhook(db, body, headers):
        raise HTTPException(401, "Invalid webhook signature")
    provider = ES.get_provider(db)
    try:
        parsed = provider.parse_webhook(body, headers.get("content-type", ""))
    except Exception:
        raise HTTPException(400, "Unparseable webhook payload")
    external_id = parsed.get("external_id")
    if not external_id:
        raise HTTPException(400, "Missing envelope id")
    env = db.query(ESignEnvelope).filter(ESignEnvelope.external_id == external_id).first()
    if env is None:
        raise HTTPException(404, "Unknown envelope")

    status = ES.STATUS_MAP.get((parsed.get("status") or "").upper())
    if status:
        env.status = EnvelopeStatus(status)
        db.add(EnvelopeEvent(envelope_id=env.id, event_type="status", status=status))
    for r in parsed.get("recipients", []):
        db.add(EnvelopeEvent(envelope_id=env.id, event_type="recipient",
                             recipient=r.get("email"), status=(r.get("status") or "").upper()))

    if status == "COMPLETED" and env.contract_id is None:
        _on_completed(db, env, provider)

    log_action(db, "contract_draft", env.draft_id, "ENVELOPE_EVENT", user_id=None,
               field=external_id, new_value=status or "event")
    db.commit()
    return {"ok": True, "status": env.status.value}


def _on_completed(db, env: ESignEnvelope, provider) -> None:
    """Pull the signed PDF, attach it, and publish an EXECUTED contract into the
    register — running duplicate detection so reminders/vendor history apply."""
    draft = db.get(ContractDraft, env.draft_id)
    env.completed_at = utcnow()

    # Save signed document + certificate (best-effort).
    out_dir = Path(getattr(settings, "MANUAL_UPLOAD_DIR", "./manual_uploads")) / "esign"
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        signed = provider.download_signed(env.external_id)
        if signed:
            p = out_dir / f"draft-{env.draft_id}-signed.pdf"
            p.write_bytes(signed)
            env.signed_pdf_path = str(p.resolve())
    except Exception:
        # This is the executed contract itself. Losing it silently leaves a
        # record marked fully signed with no signed document behind it, and
        # nobody finds out until someone goes looking for the PDF.
        log.exception("Could not retrieve the signed PDF for envelope %s (draft %s); "
                      "the record will show as executed with no signed document",
                      env.external_id, env.draft_id)
    # 2.5: retrieve the Certificate of Completion and store it alongside the signed PDF.
    try:
        cert = provider.download_certificate(env.external_id)
        if cert:
            cp = out_dir / f"draft-{env.draft_id}-certificate.pdf"
            cp.write_bytes(cert)
            env.certificate_path = str(cp.resolve())
    except Exception:
        # The Certificate of Completion is the audit evidence for the signature
        # — the thing produced when execution is challenged.
        log.exception("Could not retrieve the Certificate of Completion for "
                      "envelope %s (draft %s)", env.external_id, env.draft_id)

    fields = dict(draft.fields or {})
    from ..services.authoring import recompute_fields, render_text
    recompute_fields(fields)

    vendor_id = draft.vendor_id
    if not vendor_id and fields.get("vendor"):
        from ..services.extraction_worker import _resolve_or_create_vendor
        vendor_id = _resolve_or_create_vendor(db, fields.get("vendor"))

    def _pd(s):
        if isinstance(s, date):
            return s
        try:
            return date.fromisoformat(str(s)[:10]) if s else None
        except ValueError:
            return None

    contract = Contract(
        status=ContractStatus.VALIDATED,   # executed = validated/active in the register
        validated_at=utcnow(),
        signing_entity=fields.get("signing_entity"), vendor_id=vendor_id,
        vendor_name_raw=fields.get("vendor"), vendor_address=fields.get("vendor_address"),
        start_date=_pd(fields.get("start_date")), end_date=_pd(fields.get("end_date")),
        contract_tenure=fields.get("contract_tenure"), department_id=draft.department_id,
        po_number=fields.get("po_number"), contract_value=fields.get("contract_value"),
        currency=fields.get("currency") or "INR",
        iks_signing_authority=fields.get("iks_signing_authority"),
        vendor_signing_authority=fields.get("vendor_signing_authority"),
        contract_service=fields.get("contract_service"), service_summary=fields.get("service_summary"),
        payment_term=fields.get("payment_term"), notice_period=fields.get("notice_period"),
        line_items=fields.get("line_items") or [], location=fields.get("location"),
        phi_shared=fields.get("phi_shared"),
        contract_type=draft.contract_type or fields.get("contract_type"),
        contract_link=env.signed_pdf_path or env.document_pdf_path,
        raw_extracted={"authored": True, "draft_id": draft.id, "envelope": env.external_id},
        extracted_text=render_text(draft.document, fields)[:200_000],
        confidence={}, derived_fields=[], extraction_model="authored-esign",
    )
    if draft.link_as in ("renewal", "amendment") and draft.renews_contract_id:
        src = db.get(Contract, draft.renews_contract_id)
        if src is not None:
            contract.renews_contract_id = src.sr_no
            contract.thread_id = src.thread_id or src.sr_no
            # The signed renewal supersedes the previous contract — mark it renewed.
            if draft.link_as == "renewal":
                src.lifecycle_status = LifecycleStatus.RENEWED
    db.add(contract)
    db.flush()
    if contract.thread_id is None:
        contract.thread_id = contract.sr_no

    # Enter the existing pipeline: record duplicate candidates for review.
    from .contracts_api import _run_duplicate_detection
    _run_duplicate_detection(db, contract)

    draft.contract_id = contract.sr_no
    draft.status = DraftStatus.EXECUTED
    env.contract_id = contract.sr_no
    from ..services.event_webhooks import emit_event
    emit_event(db, "contract.validated", contract)
    log_action(db, "contract", contract.sr_no, "EXECUTED", user_id=None,
               new_value=f"Signed via {env.provider} ({env.external_id})")
    # 2.6: notify both parties that the document is fully executed.
    _notify_parties_executed(db, env, contract)


def _notify_parties_executed(db, env, contract) -> None:
    """Email every signer that the contract is executed, with a link to the record
    (signed PDF + Certificate of Completion are attached to the register entry)."""
    try:
        from ..config import settings
        from ..services.notifications import get_channel
        channel = get_channel("email")
        if channel is None:
            return
        recipients = [s.get("email") for s in (env.signers or []) if s.get("email")]
        if not recipients:
            return
        url = f"{settings.APP_BASE_URL}/contracts/{contract.sr_no}"
        docs = ["the signed contract"]
        if env.certificate_path:
            docs.append("the Certificate of Completion")
        body = (
            f"<p>The contract with {contract.vendor_name_raw or 'the vendor'} is now fully "
            f"executed by all parties.</p>"
            f"<p>{' and '.join(docs).capitalize()} are attached to the record.</p>"
            f"<p><a href='{url}'>Open the contract record</a>.</p>"
        )
        channel.send(recipients, f"[CMS] Contract executed — #{contract.sr_no}", body)
    except Exception:  # best-effort close-out notification
        log.warning("Execution close-out notification failed for contract %s",
                    contract.sr_no, exc_info=True)
