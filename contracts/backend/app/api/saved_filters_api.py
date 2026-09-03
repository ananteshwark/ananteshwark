"""Per-user saved Contracts-list filter presets ("saved views")."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_viewer
from ..database import get_db
from ..models import SavedFilter, User, utcnow
from ..schemas import SavedFilterIn

router = APIRouter(prefix="/saved-filters", tags=["saved-filters"])

# Only these keys are persisted, so an arbitrary client payload can't bloat the row.
_ALLOWED_PARAMS = {
    "status", "department_id", "vendor_id", "contract_type", "tag_id", "q", "in_text",
    "signing_entity", "lifecycle_status", "phi_shared", "expiring_days", "sort", "order",
}


def _out(f: SavedFilter) -> dict:
    return {"id": f.id, "name": f.name, "params": f.params or {}}


def _clean(params: dict) -> dict:
    return {k: v for k, v in (params or {}).items() if k in _ALLOWED_PARAMS and v not in (None, "")}


@router.get("")
def list_saved_filters(db: Session = Depends(get_db), user: User = Depends(require_viewer)):
    rows = (
        db.query(SavedFilter)
        .filter(SavedFilter.user_id == user.id, SavedFilter.deleted_at.is_(None))
        .order_by(SavedFilter.name)
        .all()
    )
    return [_out(f) for f in rows]


@router.post("")
def save_filter(payload: SavedFilterIn, db: Session = Depends(get_db), user: User = Depends(require_viewer)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "A name is required")
    params = _clean(payload.params)
    # Upsert by name for this user, so re-saving a view updates it in place.
    existing = (
        db.query(SavedFilter)
        .filter(
            SavedFilter.user_id == user.id,
            SavedFilter.deleted_at.is_(None),
            func.lower(SavedFilter.name) == name.lower(),
        )
        .first()
    )
    if existing is not None:
        existing.name = name
        existing.params = params
        db.commit()
        return _out(existing)
    row = SavedFilter(user_id=user.id, name=name, params=params)
    db.add(row)
    db.commit()
    return _out(row)


@router.delete("/{filter_id}")
def delete_saved_filter(filter_id: int, db: Session = Depends(get_db), user: User = Depends(require_viewer)):
    row = db.get(SavedFilter, filter_id)
    if row is None or row.deleted_at is not None or row.user_id != user.id:
        raise HTTPException(404, "Saved filter not found")
    row.deleted_at = utcnow()
    db.commit()
    return {"ok": True}
