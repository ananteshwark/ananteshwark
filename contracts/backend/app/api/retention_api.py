"""Data retention: admin view of soft-deleted records with restore / permanent
purge. Purge is a hard delete and is guarded so it can never orphan live data."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_super_admin
from ..database import get_db
from ..models import (
    Contract,
    ContractAttachment,
    ContractNote,
    ContractRecipient,
    DuplicateCandidate,
    IngestionFile,
    ReminderLog,
    RuleDepartmentMap,
    User,
    Vendor,
    VendorAlias,
    contract_tags,
)
from ..schemas import RetentionAction

router = APIRouter(prefix="/retention", tags=["retention"])

_ENTITIES = ("contract", "vendor", "department")


def _deleted_query(db: Session, entity_type: str):
    if entity_type == "contract":
        return db.query(Contract).filter(Contract.deleted_at.isnot(None))
    if entity_type == "vendor":
        return db.query(Vendor).filter(Vendor.deleted_at.isnot(None))
    if entity_type == "department":
        from ..models import Department
        return db.query(Department).filter(Department.deleted_at.isnot(None))
    raise HTTPException(400, f"Unknown entity_type: {entity_type}")


def _label(entity_type: str, row) -> str:
    if entity_type == "contract":
        return f"#{row.sr_no} {row.vendor_name_raw or (row.vendor.name if row.vendor else '')}".strip()
    return row.name


def _id(entity_type: str, row) -> int:
    return row.sr_no if entity_type == "contract" else row.id


@router.get("/deleted")
def list_deleted(
    entity_type: str = "contract", limit: int = 200,
    db: Session = Depends(get_db), _: User = Depends(require_admin),
):
    rows = _deleted_query(db, entity_type).limit(min(limit, 1000)).all()
    return {
        "entity_type": entity_type,
        "items": [
            {"id": _id(entity_type, r), "label": _label(entity_type, r),
             "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None}
            for r in rows
        ],
    }


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {et: _deleted_query(db, et).count() for et in _ENTITIES}


def _get_deleted(db: Session, entity_type: str, entity_id: int):
    if entity_type == "contract":
        row = db.get(Contract, entity_id)
    elif entity_type == "vendor":
        row = db.get(Vendor, entity_id)
    else:
        from ..models import Department
        row = db.get(Department, entity_id)
    if row is None or row.deleted_at is None:
        raise HTTPException(404, "No soft-deleted record with that id")
    return row


@router.post("/restore")
def restore(payload: RetentionAction, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Clear the soft-delete flag, bringing a record back."""
    row = _get_deleted(db, payload.entity_type, payload.id)
    row.deleted_at = None
    log_action(db, payload.entity_type, payload.id, "RESTORE", user_id=user.id)
    db.commit()
    return {"ok": True, "entity_type": payload.entity_type, "id": payload.id}


@router.post("/purge")
def purge(payload: RetentionAction, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    """Permanently delete a soft-deleted record and its dependent rows. Guarded
    so a vendor/department still referenced by a live contract cannot be purged."""
    et, eid = payload.entity_type, payload.id
    row = _get_deleted(db, et, eid)

    if et == "contract":
        if getattr(row, "legal_hold", False):
            raise HTTPException(423, "Contract is under legal hold and cannot be purged. Release the hold first.")
        db.execute(contract_tags.delete().where(contract_tags.c.contract_id == eid))
        db.query(ContractAttachment).filter(ContractAttachment.contract_id == eid).delete()
        db.query(ContractNote).filter(ContractNote.contract_id == eid).delete()
        db.query(ContractRecipient).filter(ContractRecipient.contract_id == eid).delete()
        db.query(ReminderLog).filter(ReminderLog.contract_id == eid).delete()
        db.query(DuplicateCandidate).filter(
            (DuplicateCandidate.contract_id == eid) | (DuplicateCandidate.matched_contract_id == eid)
        ).delete()
        db.query(IngestionFile).filter(IngestionFile.contract_id == eid).update({IngestionFile.contract_id: None})
        db.query(Contract).filter(Contract.renews_contract_id == eid).update({Contract.renews_contract_id: None})
        db.delete(row)

    elif et == "vendor":
        live = db.query(Contract).filter(
            Contract.vendor_id == eid, Contract.deleted_at.is_(None)
        ).count()
        if live:
            raise HTTPException(409, f"Vendor is still referenced by {live} live contract(s)")
        db.query(Contract).filter(Contract.vendor_id == eid).update({Contract.vendor_id: None})
        db.query(VendorAlias).filter(VendorAlias.vendor_id == eid).delete()
        db.delete(row)

    else:  # department
        live = db.query(Contract).filter(
            Contract.department_id == eid, Contract.deleted_at.is_(None)
        ).count()
        if live:
            raise HTTPException(409, f"Department is still referenced by {live} live contract(s)")
        db.query(Contract).filter(Contract.department_id == eid).update({Contract.department_id: None})
        db.query(RuleDepartmentMap).filter(RuleDepartmentMap.department_id == eid).delete()
        db.delete(row)

    log_action(db, et, eid, "PURGE", user_id=user.id, old_value=_label(et, row))
    db.commit()
    return {"ok": True, "entity_type": et, "id": eid}
