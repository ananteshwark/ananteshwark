"""No-login contract action tokens: renew/terminate decisions taken straight
from an expiry-reminder email, and the queued renewal draft they produce."""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..models import (
    Contract,
    ContractActionToken,
    ContractDraft,
    DraftStatus,
    LifecycleStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def mint_token(db: Session, contract: Contract, valid_days: int = 60) -> ContractActionToken:
    """Return an active token for the contract, reusing an unused one if present."""
    existing = (
        db.query(ContractActionToken)
        .filter(ContractActionToken.contract_id == contract.sr_no)
        .filter(ContractActionToken.used_at.is_(None))
        .order_by(ContractActionToken.id.desc())
        .first()
    )
    if existing and (existing.expires_at is None or _aware(existing.expires_at) > _now()):
        return existing
    tok = ContractActionToken(
        token=secrets.token_urlsafe(32), contract_id=contract.sr_no,
        expires_at=_now() + timedelta(days=valid_days),
    )
    db.add(tok)
    db.flush()
    return tok


def _aware(dt: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes; treat them as UTC for comparison.
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def token_is_valid(tok: ContractActionToken | None) -> tuple[bool, str]:
    if tok is None:
        return False, "This link is not valid."
    if tok.used_at is not None:
        return False, "This link has already been used."
    exp = _aware(tok.expires_at)
    if exp is not None and exp <= _now():
        return False, "This link has expired."
    return True, ""


def find_pending_renewal_draft(db: Session, sr_no: int) -> ContractDraft | None:
    """An in-progress (not yet finalized) renewal draft for this contract, if any."""
    return (
        db.query(ContractDraft)
        .filter(ContractDraft.renews_contract_id == sr_no)
        .filter(ContractDraft.contract_id.is_(None))
        .filter(ContractDraft.deleted_at.is_(None))
        .order_by(ContractDraft.id.desc())
        .first()
    )


def auto_draft_due_renewals(db: Session, today: date, lead_days: int = 60) -> int:
    """Create renewal drafts for validated, active contracts expiring within
    `lead_days`, unless one is already queued or the contract was already
    renewed. Returns how many new drafts were created."""
    from ..models import ContractStatus

    horizon = today + timedelta(days=lead_days)
    rows = (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.lifecycle_status == LifecycleStatus.ACTIVE)
        .filter(Contract.end_date.isnot(None))
        .filter(Contract.end_date >= today)
        .filter(Contract.end_date <= horizon)
        .all()
    )
    created = 0
    for c in rows:
        # Skip if this contract already has a successor renewal contract.
        successor = db.query(Contract).filter(Contract.renews_contract_id == c.sr_no).first()
        if successor is not None:
            continue
        if find_pending_renewal_draft(db, c.sr_no) is not None:
            continue
        create_renewal_draft(db, c, renewal_defaults(c), created_by_id=None)
        created += 1
    if created:
        db.commit()
    return created


def renewal_defaults(contract: Contract) -> dict:
    """Prefilled renewal values: start = current end + 1 day; end keeps the same
    term length; entity / type / service copied from the expiring contract."""
    start = end = None
    term_days = None
    if contract.end_date:
        start = contract.end_date + timedelta(days=1)
        if contract.start_date:
            term_days = (contract.end_date - contract.start_date).days
            if term_days > 0:
                end = start + timedelta(days=term_days)
    return {
        "signing_entity": contract.signing_entity,
        "contract_type": contract.contract_type,
        "contract_service": contract.contract_service,
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
        "phi_shared": False,
        "term_days": term_days,
    }


def _pd(s):
    if isinstance(s, date):
        return s
    try:
        return date.fromisoformat(str(s)[:10]) if s else None
    except ValueError:
        return None


def create_renewal_draft(db: Session, contract: Contract, payload: dict,
                         created_by_id: int | None = None) -> ContractDraft:
    """Build a queued renewal draft from an expiring contract + the recipient's
    (or author's) chosen renewal terms. Reuses any pending renewal draft."""
    from . import authoring

    existing = find_pending_renewal_draft(db, contract.sr_no)
    fields = authoring.renewal_fields_from_contract(contract)
    fields["signing_entity"] = payload.get("signing_entity") or fields.get("signing_entity")
    fields["contract_service"] = payload.get("contract_service") or fields.get("contract_service")
    fields["contract_type"] = payload.get("contract_type") or contract.contract_type
    if payload.get("start_date"):
        fields["start_date"] = _pd(payload["start_date"]).isoformat() if _pd(payload["start_date"]) else fields.get("start_date")
    if payload.get("end_date"):
        fields["end_date"] = _pd(payload["end_date"]).isoformat() if _pd(payload["end_date"]) else fields.get("end_date")
    fields["phi_shared"] = bool(payload.get("phi_shared"))
    authoring.recompute_fields(fields)
    contract_type = payload.get("contract_type") or contract.contract_type

    # Rebuild an editable body from the source (authored doc if present, else text).
    src_draft = (
        db.query(ContractDraft)
        .filter(ContractDraft.contract_id == contract.sr_no, ContractDraft.document.isnot(None))
        .order_by(ContractDraft.id.desc()).first()
    )
    if src_draft:
        document = src_draft.document
    elif contract.extracted_text:
        document = authoring.document_from_text(contract.extracted_text)
    else:
        document = authoring.scaffold_document(contract_type)

    if existing is not None:
        # Refresh the pending draft's terms rather than creating a duplicate.
        existing.fields = fields
        existing.contract_type = contract_type
        db.flush()
        return existing

    draft = ContractDraft(
        title=f"Renewal of #{contract.sr_no}", contract_type=contract_type,
        status=DraftStatus.DRAFT, fields=fields, document=document,
        vendor_id=contract.vendor_id, department_id=contract.department_id,
        source_contract_id=contract.sr_no, origin="renewal",
        renews_contract_id=contract.sr_no, link_as="renewal",
        created_by_id=created_by_id,
    )
    db.add(draft)
    db.flush()
    return draft
