"""Public, token-scoped vendor collaboration endpoints — NO authentication.

A vendor's identity and scope are derived entirely from the share-link token.
A token exposes exactly one draft and nothing else. Every open/edit is logged
with IP + user agent. These routes are intentionally NOT behind require_* deps.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContractDraft, NegotiationRound, RoundStatus, ShareAccess, TrackedChange, VendorShareLink
from ..schemas import OtpVerify, VendorChangeIn
from ..services import collaboration as CO

router = APIRouter(prefix="/vendor", tags=["vendor"])


def _link(db: Session, token: str) -> VendorShareLink:
    link = db.query(VendorShareLink).filter(VendorShareLink.token == token).first()
    ok, reason = CO.link_is_valid(link)
    if not ok:
        raise HTTPException(403, reason)
    return link


def _client(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    return ip, request.headers.get("user-agent")


def _throttle(request: Request, token: str, max_hits: int = 60, window_s: float = 60.0) -> None:
    """Rate-limit the unauthenticated surface by IP+token."""
    from ..services.rate_limit import allow
    ip = request.client.host if request.client else "?"
    if not allow(f"{ip}:{token[:16]}", max_hits, window_s):
        raise HTTPException(429, "Too many requests — please slow down and try again shortly.")


_OTP_MAX_FAILURES = 5


def _register_otp_failure(db, link) -> None:
    """Count a wrong OTP; lock the link (revoke) after too many attempts."""
    link.otp_failures = (link.otp_failures or 0) + 1
    if link.otp_failures >= _OTP_MAX_FAILURES:
        link.revoked_at = CO._now()
    db.commit()


@router.get("/{token}")
def open_draft(token: str, request: Request, db: Session = Depends(get_db)):
    _throttle(request, token)
    link = _link(db, token)
    ip, ua = _client(request)
    CO.record_open(db, link, ip, ua)
    db.commit()
    if link.otp_code and not link.otp_verified:
        return {"otp_required": True, "recipient_email": link.recipient_email}
    draft = db.get(ContractDraft, link.draft_id)
    rnd = db.get(NegotiationRound, link.round_id) if link.round_id else None
    return CO.sanitized_draft(draft, link, cover_message=rnd.cover_message if rnd else None)


@router.post("/{token}/verify-otp")
def verify_otp(token: str, payload: OtpVerify, request: Request, db: Session = Depends(get_db)):
    _throttle(request, token, max_hits=10, window_s=60.0)   # stricter for OTP guesses
    link = _link(db, token)
    if not link.otp_code:
        return {"ok": True}
    if payload.code.strip() != link.otp_code:
        _register_otp_failure(db, link)
        raise HTTPException(401, "Incorrect verification code.")
    link.otp_verified = True
    db.commit()
    return {"ok": True}


@router.post("/{token}/resend-otp")
def resend_otp(token: str, db: Session = Depends(get_db)):
    """Re-email the one-time code to the recipient on file."""
    link = _link(db, token)
    if not link.otp_code:
        return {"ok": True, "sent": False}
    from ..services.collaboration import send_otp_email
    sent = send_otp_email(link, db)
    return {"ok": True, "sent": sent}


def _require_verified(link: VendorShareLink):
    if link.otp_code and not link.otp_verified:
        raise HTTPException(403, "Verify the emailed code before continuing.")


@router.post("/{token}/changes")
def submit_change(token: str, payload: VendorChangeIn, request: Request, db: Session = Depends(get_db)):
    _throttle(request, token)
    link = _link(db, token)
    _require_verified(link)
    if link.access == ShareAccess.VIEW:
        raise HTTPException(403, "This link is view-only.")
    if link.access == ShareAccess.COMMENT and payload.change_type != "COMMENT":
        raise HTTPException(403, "This link allows comments only.")
    ip, ua = _client(request)
    CO.record_open(db, link, ip, ua)
    draft = db.get(ContractDraft, link.draft_id)
    change = CO.add_change(db, draft, link, payload.model_dump())
    db.commit()
    return {"id": change.id, "change_type": change.change_type.value, "clause_type": change.clause_type}


class InlineSuggest(__import__("pydantic").BaseModel):
    document: dict


@router.post("/{token}/suggest-inline")
def suggest_inline(token: str, payload: InlineSuggest, request: Request, db: Session = Depends(get_db)):
    """Accept the vendor's edited document and derive tracked changes from the
    block-level diff against the current draft (inline suggestion-mode redline)."""
    _throttle(request, token)
    link = _link(db, token)
    _require_verified(link)
    if link.access != ShareAccess.SUGGEST:
        raise HTTPException(403, "This link does not allow editing.")
    ip, ua = _client(request)
    CO.record_open(db, link, ip, ua)
    draft = db.get(ContractDraft, link.draft_id)
    derived = CO.derive_inline_changes(draft.document, payload.document)
    created = [CO.add_change(db, draft, link, c) for c in derived]
    db.commit()
    return {"created": len(created),
            "changes": [{"id": c.id, "change_type": c.change_type.value,
                         "clause_type": c.clause_type} for c in created]}


@router.get("/{token}/changes")
def my_changes(token: str, db: Session = Depends(get_db)):
    link = _link(db, token)
    rows = (
        db.query(TrackedChange)
        .filter(TrackedChange.share_link_id == link.id)
        .order_by(TrackedChange.id)
        .all()
    )
    return [
        {"id": c.id, "change_type": c.change_type.value, "clause_type": c.clause_type,
         "original_text": c.original_text, "proposed_text": c.proposed_text,
         "rationale": c.rationale, "disposition": c.disposition.value,
         "disposition_reason": c.disposition_reason, "countered_text": c.countered_text}
        for c in rows
    ]


@router.get("/{token}/document.pdf")
def download_document(token: str, request: Request, db: Session = Depends(get_db)):
    """Watermarked PDF of the draft — only when the link permits download."""
    from fastapi.responses import Response
    from ..services.authoring import render_text
    from ..services.letterhead import spec_for_draft
    from ..services.pdf import text_to_pdf
    _throttle(request, token)
    link = _link(db, token)
    _require_verified(link)
    if not link.allow_download:
        raise HTTPException(403, "Download is not permitted for this link.")
    draft = db.get(ContractDraft, link.draft_id)
    banner = (f"CONFIDENTIAL DRAFT — for review by {link.recipient_email} — not for distribution\n\n"
              if link.watermark else "")
    # The vendor's copy is the one they read and mark up — it goes out on the
    # same paper as the copy they will eventually be asked to sign.
    data = text_to_pdf((draft.title or "CONTRACT").upper(),
                       banner + render_text(draft.document, draft.fields or {}),
                       letterhead=spec_for_draft(db, draft))
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="contract-draft.pdf"'})


@router.post("/{token}/accept")
def accept_version(token: str, request: Request, db: Session = Depends(get_db)):
    """Vendor accepts the current version of the contract. Records acceptance on
    the draft (which unlocks send-for-signature for the author) and closes the
    round. View-only links may not accept."""
    _throttle(request, token)
    link = _link(db, token)
    _require_verified(link)
    if link.access == ShareAccess.VIEW:
        raise HTTPException(403, "This link is view-only.")
    from ..models import utcnow
    draft = db.get(ContractDraft, link.draft_id)
    draft.vendor_accepted_at = utcnow()
    rnd = db.get(NegotiationRound, link.round_id) if link.round_id else None
    if rnd and rnd.status == RoundStatus.SHARED:
        rnd.status = RoundStatus.RETURNED
        rnd.returned_at = utcnow()
    db.commit()
    return {"ok": True, "vendor_accepted": True,
            "message": "Thank you — you've accepted this version. It will be sent for signature."}


@router.post("/{token}/submit")
def submit_round(token: str, request: Request, db: Session = Depends(get_db)):
    """Vendor returns the draft — marks the round RETURNED for internal review."""
    link = _link(db, token)
    _require_verified(link)
    rnd = db.get(NegotiationRound, link.round_id) if link.round_id else None
    if rnd and rnd.status == RoundStatus.SHARED:
        from ..models import utcnow
        rnd.status = RoundStatus.RETURNED
        rnd.returned_at = utcnow()
    db.commit()
    return {"ok": True, "message": "Thank you — your changes have been returned for review."}
