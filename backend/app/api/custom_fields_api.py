"""Admin-defined custom fields for contracts (G7). Admins manage the field
definitions here; values live on Contract.custom_fields and are read/written
through the normal contract update path. Definitions can apply to all contract
types or be scoped to one."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import CustomFieldDef, User

router = APIRouter(prefix="/custom-fields", tags=["custom-fields"])

_TYPES = {"text", "number", "date", "select", "bool"}


class FieldIn(BaseModel):
    label: str
    key: str | None = None
    field_type: str = "text"
    options: list[str] | None = None
    applies_to_type: str | None = None
    required: bool = False
    sort_order: int = 0
    active: bool = True


class FieldUpdate(BaseModel):
    label: str | None = None
    field_type: str | None = None
    options: list[str] | None = None
    applies_to_type: str | None = None
    required: bool | None = None
    sort_order: int | None = None
    active: bool | None = None


def _out(f: CustomFieldDef) -> dict:
    return {"id": f.id, "key": f.key, "label": f.label, "field_type": f.field_type,
            "options": f.options or [], "applies_to_type": f.applies_to_type,
            "required": f.required, "sort_order": f.sort_order, "active": f.active}


def _slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_")
    return s or "field"


@router.get("")
def list_fields(contract_type: str | None = None, include_inactive: bool = False,
                db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Field definitions, optionally narrowed to those applying to a contract
    type (a null applies_to_type means the field applies to every type)."""
    q = db.query(CustomFieldDef).filter(CustomFieldDef.deleted_at.is_(None))
    if not include_inactive:
        q = q.filter(CustomFieldDef.active.is_(True))
    rows = q.order_by(CustomFieldDef.sort_order, CustomFieldDef.id).all()
    if contract_type is not None:
        rows = [f for f in rows if not f.applies_to_type or f.applies_to_type == contract_type]
    return [_out(f) for f in rows]


@router.post("")
def create_field(payload: FieldIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if payload.field_type not in _TYPES:
        raise HTTPException(400, f"field_type must be one of {sorted(_TYPES)}")
    if not payload.label.strip():
        raise HTTPException(400, "Label is required")
    key = _slug(payload.key or payload.label)
    exists = (
        db.query(CustomFieldDef)
        .filter(CustomFieldDef.key == key, CustomFieldDef.deleted_at.is_(None))
        .first()
    )
    if exists:
        raise HTTPException(409, f"A custom field with key '{key}' already exists")
    f = CustomFieldDef(
        key=key, label=payload.label.strip(), field_type=payload.field_type,
        options=payload.options or None, applies_to_type=(payload.applies_to_type or None),
        required=payload.required, sort_order=payload.sort_order, active=payload.active,
    )
    db.add(f)
    db.flush()
    log_action(db, "custom_field", f.id, "CREATE", user_id=user.id, new_value=f.label)
    db.commit()
    return _out(f)


@router.put("/{field_id}")
def update_field(field_id: int, payload: FieldUpdate, db: Session = Depends(get_db),
                 user: User = Depends(require_admin)):
    f = db.get(CustomFieldDef, field_id)
    if f is None or f.deleted_at is not None:
        raise HTTPException(404, "Custom field not found")
    if payload.field_type is not None:
        if payload.field_type not in _TYPES:
            raise HTTPException(400, f"field_type must be one of {sorted(_TYPES)}")
        f.field_type = payload.field_type
    if payload.label is not None:
        f.label = payload.label.strip()
    if payload.options is not None:
        f.options = payload.options or None
    if payload.applies_to_type is not None:
        f.applies_to_type = payload.applies_to_type or None
    if payload.required is not None:
        f.required = payload.required
    if payload.sort_order is not None:
        f.sort_order = payload.sort_order
    if payload.active is not None:
        f.active = payload.active
    log_action(db, "custom_field", f.id, "UPDATE", user_id=user.id)
    db.commit()
    return _out(f)


@router.delete("/{field_id}")
def delete_field(field_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    from datetime import datetime, timezone
    f = db.get(CustomFieldDef, field_id)
    if f is None or f.deleted_at is not None:
        raise HTTPException(404, "Custom field not found")
    f.deleted_at = datetime.now(timezone.utc)
    log_action(db, "custom_field", f.id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}
