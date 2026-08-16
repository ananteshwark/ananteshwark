from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import AuditLog, User

router = APIRouter(prefix="/audit", tags=["audit"])


def _audit_query(db, entity_type, entity_id, user_id, action):
    query = db.query(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(AuditLog.entity_id == entity_id)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    return query


def _audit_row(a: AuditLog, u: User | None) -> dict:
    return {
        "id": a.id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "action": a.action,
        "field": a.field,
        "old_value": a.old_value,
        "new_value": a.new_value,
        "user": u.name if u else None,
        "user_id": a.user_id,
        "created_at": a.created_at.isoformat(),
    }


@router.get("")
def list_audit(
    entity_type: str | None = None,
    entity_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Organization-wide audit trail (admin only)."""
    query = _audit_query(db, entity_type, entity_id, user_id, action)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).limit(min(limit, 500)).offset(offset).all()
    return {"total": total, "items": [_audit_row(a, u) for a, u in rows]}


@router.get("/export")
def export_audit(
    entity_type: str | None = None,
    entity_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    limit: int = 10000,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Export the filtered audit trail as CSV (admin only)."""
    import csv
    import io

    from fastapi.responses import Response

    query = _audit_query(db, entity_type, entity_id, user_id, action)
    rows = query.order_by(AuditLog.created_at.desc()).limit(min(limit, 50000)).all()
    fields = [
        "id", "created_at", "entity_type", "entity_id", "action", "field",
        "old_value", "new_value", "user", "user_id",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    for a, u in rows:
        writer.writerow(_audit_row(a, u))
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_log.csv"'},
    )


@router.get("/entity-types")
def entity_types(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.query(AuditLog.entity_type).distinct().all()
    return sorted({r[0] for r in rows})
