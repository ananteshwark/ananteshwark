from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import Department, User
from ..schemas import DepartmentIn

router = APIRouter(prefix="/departments", tags=["departments"])


def _out(d: Department) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "default_recipient_email": d.default_recipient_email,
        "default_recipient_name": d.default_recipient_name,
        "approval_require_legal": d.approval_require_legal,
        "approval_value_threshold": (
            float(d.approval_value_threshold) if d.approval_value_threshold is not None else None
        ),
        "default_signers": d.default_signers or [],
    }


@router.get("")
def list_departments(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return [_out(d) for d in db.query(Department).filter(Department.deleted_at.is_(None)).order_by(Department.name).all()]


@router.post("")
def create_department(payload: DepartmentIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if db.query(Department).filter(Department.name == payload.name, Department.deleted_at.is_(None)).first():
        raise HTTPException(400, "Department already exists")
    dept = Department(**payload.model_dump())
    db.add(dept)
    db.flush()
    log_action(db, "department", dept.id, "CREATE", user_id=user.id, new_value=payload.name)
    db.commit()
    return _out(dept)


@router.put("/{dept_id}")
def update_department(
    dept_id: int, payload: DepartmentIn, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    dept = db.get(Department, dept_id)
    if dept is None or dept.deleted_at is not None:
        raise HTTPException(404, "Department not found")
    log_action(db, "department", dept.id, "UPDATE", user_id=user.id,
               old_value=dept.name, new_value=payload.name)
    for field, value in payload.model_dump().items():
        setattr(dept, field, value)
    db.commit()
    return _out(dept)


@router.delete("/{dept_id}")
def delete_department(dept_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    dept = db.get(Department, dept_id)
    if dept is None or dept.deleted_at is not None:
        raise HTTPException(404, "Department not found")
    dept.deleted_at = datetime.now(timezone.utc)  # soft delete only
    log_action(db, "department", dept.id, "SOFT_DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}
