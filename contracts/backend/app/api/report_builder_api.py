"""Custom report builder + scheduling (G8): CRUD for saved report definitions,
run/preview, CSV export, and manual or scheduled email delivery."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import ReportDefinition, User
from ..services.report_builder import available_columns, report_to_csv, run_report

router = APIRouter(prefix="/report-builder", tags=["report-builder"])

_SCHEDULES = {"none", "daily", "weekly", "monthly"}


class ReportIn(BaseModel):
    name: str
    description: str | None = None
    filters: dict | None = None
    columns: list[str] | None = None
    sort: str | None = None
    schedule: str = "none"
    schedule_day: int | None = None
    recipients: list[str] | None = None
    active: bool = True


class ReportUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    filters: dict | None = None
    columns: list[str] | None = None
    sort: str | None = None
    schedule: str | None = None
    schedule_day: int | None = None
    recipients: list[str] | None = None
    active: bool | None = None


def _out(d: ReportDefinition) -> dict:
    return {
        "id": d.id, "name": d.name, "description": d.description, "filters": d.filters or {},
        "columns": d.columns or [], "sort": d.sort, "schedule": d.schedule,
        "schedule_day": d.schedule_day, "recipients": d.recipients or [], "active": d.active,
        "last_run_at": d.last_run_at.isoformat() if d.last_run_at else None,
    }


def _get(db: Session, report_id: int) -> ReportDefinition:
    d = db.get(ReportDefinition, report_id)
    if d is None or d.deleted_at is not None:
        raise HTTPException(404, "Report not found")
    return d


@router.get("/columns")
def columns(_: User = Depends(require_viewer)):
    return {"columns": available_columns()}


@router.get("")
def list_reports(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = (
        db.query(ReportDefinition)
        .filter(ReportDefinition.deleted_at.is_(None))
        .order_by(ReportDefinition.name)
        .all()
    )
    return [_out(d) for d in rows]


@router.post("")
def create_report(payload: ReportIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if payload.schedule not in _SCHEDULES:
        raise HTTPException(400, f"schedule must be one of {sorted(_SCHEDULES)}")
    if not payload.name.strip():
        raise HTTPException(400, "Name is required")
    d = ReportDefinition(
        name=payload.name.strip(), description=payload.description, filters=payload.filters or {},
        columns=payload.columns or None, sort=payload.sort, schedule=payload.schedule,
        schedule_day=payload.schedule_day, recipients=payload.recipients or None,
        active=payload.active, created_by_id=user.id,
    )
    db.add(d)
    db.flush()
    log_action(db, "report_definition", d.id, "CREATE", user_id=user.id, new_value=d.name)
    db.commit()
    return _out(d)


@router.put("/{report_id}")
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db),
                  user: User = Depends(require_admin)):
    d = _get(db, report_id)
    if payload.schedule is not None and payload.schedule not in _SCHEDULES:
        raise HTTPException(400, f"schedule must be one of {sorted(_SCHEDULES)}")
    for f in ("name", "description", "filters", "columns", "sort", "schedule",
              "schedule_day", "recipients", "active"):
        v = getattr(payload, f)
        if v is not None:
            setattr(d, f, v)
    log_action(db, "report_definition", d.id, "UPDATE", user_id=user.id)
    db.commit()
    return _out(d)


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    d = _get(db, report_id)
    d.deleted_at = datetime.now(timezone.utc)
    log_action(db, "report_definition", d.id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.post("/{report_id}/run")
def run(report_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    d = _get(db, report_id)
    return run_report(db, d)


@router.get("/{report_id}/export.csv")
def export_csv(report_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    d = _get(db, report_id)
    csv_text = report_to_csv(run_report(db, d))
    fname = (d.name or "report").replace(" ", "_").lower()
    return Response(content=csv_text, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})


@router.post("/{report_id}/send")
def send_now(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Run and email the report to its configured recipients immediately."""
    d = _get(db, report_id)
    from ..services.report_delivery import deliver_report
    ok, detail = deliver_report(db, d)
    log_action(db, "report_definition", d.id, "SEND", user_id=user.id, new_value=detail)
    db.commit()
    if not ok:
        raise HTTPException(400, detail)
    return {"ok": True, "detail": detail}
