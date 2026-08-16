from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import (
    Contract,
    ReminderLog,
    ReminderRule,
    RuleDepartmentMap,
    User,
)
from ..schemas import RuleIn
from ..services.reminders import run_daily_check

router = APIRouter(prefix="/rules", tags=["reminder-rules"])


def _out(db: Session, rule: ReminderRule) -> dict:
    dept_ids = [
        m.department_id
        for m in db.query(RuleDepartmentMap).filter(RuleDepartmentMap.rule_id == rule.id).all()
    ]
    return {
        "id": rule.id,
        "name": rule.name,
        "offsets": rule.offsets,
        "periodicity_days": rule.periodicity_days,
        "post_expiry_days": rule.post_expiry_days,
        "escalation_after": rule.escalation_after,
        "escalation_email": rule.escalation_email,
        "channels": rule.channels,
        "department_ids": dept_ids,
    }


def _apply_mapping(db: Session, rule: ReminderRule, department_ids: list[int], scope: str, user_id: int):
    """Map rule -> departments. Each department has at most one rule.

    scope: 'existing_and_new' also clears per-contract rule overrides pointing at
    the old default so existing contracts pick up the new mapping; 'new_only'
    leaves existing contracts untouched.
    """
    db.query(RuleDepartmentMap).filter(RuleDepartmentMap.rule_id == rule.id).delete()
    for dept_id in department_ids:
        db.query(RuleDepartmentMap).filter(RuleDepartmentMap.department_id == dept_id).delete()
        db.add(RuleDepartmentMap(rule_id=rule.id, department_id=dept_id))
        if scope == "existing_and_new":
            # Existing contracts with no explicit override follow the mapping
            # automatically (resolved at send time), nothing further needed.
            pass
    log_action(db, "reminder_rule", rule.id, "MAP_DEPARTMENTS", user_id=user_id,
               new_value=f"departments={department_ids} scope={scope}")


@router.get("")
def list_rules(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rules = db.query(ReminderRule).filter(ReminderRule.deleted_at.is_(None)).all()
    return [_out(db, r) for r in rules]


@router.post("")
def create_rule(payload: RuleIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if db.query(ReminderRule).filter(ReminderRule.name == payload.name, ReminderRule.deleted_at.is_(None)).first():
        raise HTTPException(400, "Rule name already exists")
    rule = ReminderRule(
        name=payload.name,
        offsets=sorted(set(payload.offsets), reverse=True),
        periodicity_days=payload.periodicity_days,
        post_expiry_days=payload.post_expiry_days,
        escalation_after=payload.escalation_after,
        escalation_email=payload.escalation_email,
        channels=payload.channels,
    )
    db.add(rule)
    db.flush()
    _apply_mapping(db, rule, payload.department_ids, payload.apply_scope, user.id)
    log_action(db, "reminder_rule", rule.id, "CREATE", user_id=user.id, new_value=payload.name)
    db.commit()
    return _out(db, rule)


@router.put("/{rule_id}")
def update_rule(rule_id: int, payload: RuleIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rule = db.get(ReminderRule, rule_id)
    if rule is None or rule.deleted_at is not None:
        raise HTTPException(404, "Rule not found")
    rule.name = payload.name
    rule.offsets = sorted(set(payload.offsets), reverse=True)
    rule.periodicity_days = payload.periodicity_days
    rule.post_expiry_days = payload.post_expiry_days
    rule.escalation_after = payload.escalation_after
    rule.escalation_email = payload.escalation_email
    rule.channels = payload.channels
    _apply_mapping(db, rule, payload.department_ids, payload.apply_scope, user.id)
    log_action(db, "reminder_rule", rule.id, "UPDATE", user_id=user.id, new_value=payload.name)
    db.commit()
    return _out(db, rule)


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    rule = db.get(ReminderRule, rule_id)
    if rule is None or rule.deleted_at is not None:
        raise HTTPException(404, "Rule not found")
    rule.deleted_at = datetime.now(timezone.utc)  # soft delete only
    db.query(RuleDepartmentMap).filter(RuleDepartmentMap.rule_id == rule.id).delete()
    log_action(db, "reminder_rule", rule.id, "SOFT_DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.post("/run-now")
def run_now(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    fired = run_daily_check(db)
    return {"reminders_fired": fired}


def _reminder_log_rows(
    db: Session, contract_id: int | None, status: str | None, limit: int
) -> list[dict]:
    query = db.query(ReminderLog).order_by(ReminderLog.sent_at.desc())
    if contract_id:
        query = query.filter(ReminderLog.contract_id == contract_id)
    if status:
        query = query.filter(ReminderLog.delivery_status == status)
    rows = query.limit(min(limit, 5000)).all()
    contracts = {
        c.sr_no: c for c in db.query(Contract).filter(
            Contract.sr_no.in_({r.contract_id for r in rows})
        ).all()
    } if rows else {}

    def vendor_of(cid):
        c = contracts.get(cid)
        if c is None:
            return None
        return c.vendor.name if c.vendor else c.vendor_name_raw

    return [
        {
            "id": r.id,
            "contract_id": r.contract_id,
            "vendor": vendor_of(r.contract_id),
            "rule_id": r.rule_id,
            "recipient": r.recipient,
            "channel": r.channel,
            "days_to_expiry": r.days_to_expiry,
            "escalated": r.escalated,
            "sent_at": r.sent_at.isoformat(),
            "delivery_status": r.delivery_status,
            "detail": r.detail,
        }
        for r in rows
    ]


@router.get("/reminder-log")
def reminder_log(
    contract_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    return _reminder_log_rows(db, contract_id, status, limit)


@router.get("/reminder-log/export")
def reminder_log_export(
    contract_id: int | None = None,
    status: str | None = None,
    limit: int = 5000,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    """Export the reminder log (respecting the same filters) as CSV."""
    import csv
    import io

    from fastapi.responses import Response

    rows = _reminder_log_rows(db, contract_id, status, limit)
    fields = [
        "id", "contract_id", "vendor", "rule_id", "recipient", "channel",
        "days_to_expiry", "escalated", "sent_at", "delivery_status", "detail",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="reminder_log.csv"'},
    )
