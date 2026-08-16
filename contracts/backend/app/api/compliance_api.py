"""Counterparty compliance vault (G14): per-vendor compliance documents with
issue/expiry tracking, an optional stored file, and a vendor risk profile."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..config import settings
from ..database import get_db
from ..models import ComplianceDocument, User, Vendor

router = APIRouter(prefix="/compliance", tags=["compliance"])

_DOC_TYPES = {"insurance", "w9", "nda", "dpa", "certification", "license", "other"}
_EXPIRING_DAYS = 30


class DocIn(BaseModel):
    vendor_id: int
    doc_type: str = "other"
    name: str
    reference: str | None = None
    issued_date: date | None = None
    expiry_date: date | None = None


class DocUpdate(BaseModel):
    doc_type: str | None = None
    name: str | None = None
    reference: str | None = None
    issued_date: date | None = None
    expiry_date: date | None = None


class RiskIn(BaseModel):
    risk_rating: str | None = None   # low/medium/high/null
    risk_notes: str | None = None


def _status(d: ComplianceDocument, today: date) -> str:
    if not d.expiry_date:
        return "none"
    if d.expiry_date < today:
        return "expired"
    if d.expiry_date <= today + timedelta(days=_EXPIRING_DAYS):
        return "expiring"
    return "valid"


def _out(d: ComplianceDocument, today: date | None = None) -> dict:
    today = today or date.today()
    return {
        "id": d.id, "vendor_id": d.vendor_id, "doc_type": d.doc_type, "name": d.name,
        "reference": d.reference,
        "issued_date": d.issued_date.isoformat() if d.issued_date else None,
        "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
        "has_file": bool(d.path), "filename": d.filename,
        "status": _status(d, today),
    }


def _vendor(db: Session, vendor_id: int) -> Vendor:
    v = db.get(Vendor, vendor_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Vendor not found")
    return v


@router.get("")
def list_docs(vendor_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = (
        db.query(ComplianceDocument)
        .filter(ComplianceDocument.vendor_id == vendor_id, ComplianceDocument.deleted_at.is_(None))
        .order_by(ComplianceDocument.expiry_date.is_(None), ComplianceDocument.expiry_date)
        .all()
    )
    return {"documents": [_out(d) for d in rows]}


@router.post("")
def create_doc(payload: DocIn, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    _vendor(db, payload.vendor_id)
    if not payload.name.strip():
        raise HTTPException(400, "Name is required")
    doc_type = payload.doc_type if payload.doc_type in _DOC_TYPES else "other"
    d = ComplianceDocument(
        vendor_id=payload.vendor_id, doc_type=doc_type, name=payload.name.strip(),
        reference=payload.reference, issued_date=payload.issued_date, expiry_date=payload.expiry_date,
    )
    db.add(d)
    db.flush()
    log_action(db, "vendor", payload.vendor_id, "ADD_COMPLIANCE_DOC", user_id=user.id, new_value=d.name)
    db.commit()
    return _out(d)


@router.patch("/{doc_id}")
def update_doc(doc_id: int, payload: DocUpdate, db: Session = Depends(get_db),
               user: User = Depends(require_validator)):
    d = db.get(ComplianceDocument, doc_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Document not found")
    if payload.doc_type is not None:
        d.doc_type = payload.doc_type if payload.doc_type in _DOC_TYPES else "other"
    if payload.name is not None:
        d.name = payload.name.strip()
    for f in ("reference", "issued_date", "expiry_date"):
        v = getattr(payload, f)
        if v is not None:
            setattr(d, f, v or None if f == "reference" else v)
    log_action(db, "vendor", d.vendor_id, "UPDATE_COMPLIANCE_DOC", user_id=user.id)
    db.commit()
    return _out(d)


@router.post("/{doc_id}/file")
def upload_file(doc_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                user: User = Depends(require_validator)):
    from ..services.upload_guard import ATTACHMENT_EXTS, save_upload
    d = db.get(ComplianceDocument, doc_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Document not found")
    dest_dir = Path(settings.ATTACHMENTS_DIR) / "compliance" / str(d.vendor_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "document").name
    dest = dest_dir / f"{doc_id}_{safe_name}"
    written = save_upload(file, dest, allowed_exts=ATTACHMENT_EXTS)
    d.filename = safe_name
    d.path = str(dest.resolve())
    d.size_bytes = written
    d.uploaded_by_id = user.id
    log_action(db, "vendor", d.vendor_id, "UPLOAD_COMPLIANCE_FILE", user_id=user.id, new_value=safe_name)
    db.commit()
    return _out(d)


@router.get("/{doc_id}/file")
def download_file(doc_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    d = db.get(ComplianceDocument, doc_id)
    if d is None or d.deleted_at is not None or not d.path:
        raise HTTPException(404, "File not found")
    if not Path(d.path).exists():
        raise HTTPException(410, "File is no longer available on disk")
    return FileResponse(d.path, filename=d.filename or "document")


@router.delete("/{doc_id}")
def delete_doc(doc_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    d = db.get(ComplianceDocument, doc_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Document not found")
    d.deleted_at = datetime.now(timezone.utc)
    log_action(db, "vendor", d.vendor_id, "DELETE_COMPLIANCE_DOC", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.put("/vendors/{vendor_id}/risk")
def set_risk(vendor_id: int, payload: RiskIn, db: Session = Depends(get_db),
             user: User = Depends(require_validator)):
    v = _vendor(db, vendor_id)
    if payload.risk_rating is not None:
        rating = (payload.risk_rating or "").strip().lower() or None
        if rating and rating not in ("low", "medium", "high"):
            raise HTTPException(400, "risk_rating must be low, medium, high, or null")
        v.risk_rating = rating
    if payload.risk_notes is not None:
        v.risk_notes = payload.risk_notes or None
    log_action(db, "vendor", vendor_id, "SET_RISK", user_id=user.id, new_value=v.risk_rating or "")
    db.commit()
    return {"id": v.id, "risk_rating": v.risk_rating, "risk_notes": v.risk_notes}


@router.get("/expiring")
def expiring(days: int = 30, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Compliance documents that are expired or expiring within `days`, across
    all vendors — the vault's watch list."""
    today = date.today()
    cutoff = today + timedelta(days=days)
    rows = (
        db.query(ComplianceDocument)
        .options(joinedload(ComplianceDocument.vendor))
        .filter(ComplianceDocument.deleted_at.is_(None),
                ComplianceDocument.expiry_date.isnot(None),
                ComplianceDocument.expiry_date <= cutoff)
        .order_by(ComplianceDocument.expiry_date)
        .all()
    )
    out = []
    for d in rows:
        if d.vendor is None or d.vendor.deleted_at is not None:
            continue
        item = _out(d, today)
        item["vendor_name"] = d.vendor.name
        item["vendor_risk"] = d.vendor.risk_rating
        out.append(item)
    return {"documents": out,
            "expired": sum(1 for x in out if x["status"] == "expired"),
            "expiring": sum(1 for x in out if x["status"] == "expiring")}
