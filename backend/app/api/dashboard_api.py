from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_viewer
from ..database import get_db
from ..models import (
    Contract,
    ContractStatus,
    Department,
    IngestionFile,
    IngestionStatus,
    LifecycleStatus,
    User,
)
from ..serializers import contract_out, ingestion_out

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/upcoming-milestones")
def upcoming_milestones(days: int = 30, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Pending contract milestones that are overdue or due within `days`."""
    from ..models import ContractMilestone, MilestoneStatus
    today = date.today()
    horizon = today + timedelta(days=days)
    rows = (
        db.query(ContractMilestone, Contract)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None))
        .filter(ContractMilestone.status == MilestoneStatus.PENDING)
        .filter(ContractMilestone.due_date.isnot(None))
        .filter(ContractMilestone.due_date <= horizon)
        .filter(Contract.deleted_at.is_(None))
        .order_by(ContractMilestone.due_date)
        .limit(100)
        .all()
    )
    return [
        {
            "id": m.id,
            "contract_id": m.contract_id,
            "vendor": (c.vendor.name if c.vendor else None) or c.vendor_name_raw,
            "title": m.title,
            "due_date": m.due_date.isoformat(),
            "overdue": m.due_date < today,
        }
        for m, c in rows
    ]


@router.get("/workload")
def workload(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Validator workload: pending-validation contracts grouped by assignee,
    with the count aging past 7 days, plus the unassigned backlog."""
    today = date.today()
    stale_before = today - timedelta(days=7)

    pending = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.PENDING_VALIDATION)
        .filter(Contract.deleted_at.is_(None))
        .all()
    )

    buckets: dict = {}
    for c in pending:
        key = c.assignee_id  # None = unassigned
        b = buckets.setdefault(key, {"pending": 0, "stale": 0, "with_end_date": 0})
        b["pending"] += 1
        created = c.created_at.date() if c.created_at else today
        if created < stale_before:
            b["stale"] += 1
        if c.end_date is not None:
            b["with_end_date"] += 1

    names = {
        u.id: u.name
        for u in db.query(User).filter(User.id.in_([k for k in buckets if k is not None])).all()
    } if buckets else {}

    rows = []
    for key, b in buckets.items():
        rows.append({
            "assignee_id": key,
            "assignee_name": names.get(key) if key is not None else None,
            "unassigned": key is None,
            **b,
        })
    rows.sort(key=lambda r: (r["unassigned"], -r["pending"]))
    return {
        "total_pending": len(pending),
        "unassigned_pending": sum(b["pending"] for k, b in buckets.items() if k is None),
        "rows": rows,
    }


@router.get("")
def dashboard(include_pending: bool = False, db: Session = Depends(get_db),
             _: User = Depends(require_viewer)):
    today = date.today()
    # By default the dashboard reflects VALIDATED contracts; the toggle widens it
    # to also include those still PENDING_VALIDATION.
    statuses = [ContractStatus.VALIDATED]
    if include_pending:
        statuses.append(ContractStatus.PENDING_VALIDATION)
    active = (
        db.query(Contract)
        .filter(Contract.status.in_(statuses))
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.lifecycle_status.in_([LifecycleStatus.ACTIVE, LifecycleStatus.EXPIRED]))
    )

    def expiring(days: int):
        return (
            active.filter(Contract.end_date.isnot(None))
            .filter(Contract.end_date >= today)
            .filter(Contract.end_date <= today + timedelta(days=days))
            .all()
        )

    exp30, exp60, exp90 = expiring(30), expiring(60), expiring(90)

    def grouped_by_dept(contracts):
        groups: dict[str, list] = {}
        for c in contracts:
            key = c.department.name if c.department else "(unassigned)"
            groups.setdefault(key, []).append(contract_out(c))
        return groups

    # Value/count by department for ACTIVE contracts only: validated and whose
    # end date has not passed (a null end date = no expiry = still active). The
    # conditions live in the outer-join ON clause so departments with no active
    # contracts still appear with a zero total.
    dept_stats = (
        db.query(
            Department.id,
            Department.name,
            func.count(Contract.sr_no),
            func.coalesce(func.sum(Contract.contract_value), 0),
        )
        .outerjoin(
            Contract,
            (Contract.department_id == Department.id)
            & Contract.deleted_at.is_(None)
            & (Contract.status.in_(statuses))
            & (Contract.end_date.is_(None) | (Contract.end_date >= today)),
        )
        .filter(Department.deleted_at.is_(None))
        .group_by(Department.id, Department.name)
        .all()
    )

    # Value/count by signing entity for ACTIVE contracts only (validated and not
    # past their end date). Grouped in Python so entities with no live contracts
    # simply don't appear; blank/unknown entities collapse into "(unspecified)".
    entity_stats: dict[str, dict] = {}
    for c in active.filter(
        Contract.end_date.is_(None) | (Contract.end_date >= today)
    ).all():
        key = (c.signing_entity or "").strip() or "(unspecified)"
        e = entity_stats.setdefault(key, {"contract_count": 0, "total_value": 0.0})
        e["contract_count"] += 1
        e["total_value"] += float(c.contract_value or 0)
    entities = [
        {"name": name, "contract_count": e["contract_count"], "total_value": e["total_value"]}
        for name, e in sorted(entity_stats.items(), key=lambda kv: -kv[1]["total_value"])
    ]

    # Expiries per month for the next 12 months (for the trend chart)
    month_keys: list[str] = []
    y, mo = today.year, today.month
    for _ in range(12):
        month_keys.append(f"{y:04d}-{mo:02d}")
        mo += 1
        if mo > 12:
            mo = 1
            y += 1
    month_counts = {k: 0 for k in month_keys}
    for c in active.filter(Contract.end_date.isnot(None)).filter(Contract.end_date >= today).all():
        key = c.end_date.strftime("%Y-%m")
        if key in month_counts:
            month_counts[key] += 1
    expiry_by_month = [{"month": k, "count": month_counts[k]} for k in month_keys]

    recent_ingestion = (
        db.query(IngestionFile).order_by(IngestionFile.detected_at.desc()).limit(15).all()
    )
    failed = (
        db.query(IngestionFile)
        .filter(IngestionFile.status == IngestionStatus.FAILED)
        .order_by(IngestionFile.detected_at.desc())
        .limit(15)
        .all()
    )

    return {
        "pending_validation": db.query(Contract)
        .filter(Contract.status == ContractStatus.PENDING_VALIDATION, Contract.deleted_at.is_(None))
        .count(),
        "total_validated": active.count(),
        "expiring": {
            "30": {"count": len(exp30), "by_department": grouped_by_dept(exp30)},
            "60": {"count": len(exp60), "by_department": grouped_by_dept(exp60)},
            "90": {"count": len(exp90), "by_department": grouped_by_dept(exp90)},
        },
        "departments": [
            {"id": did, "name": name, "contract_count": count, "total_value": float(value)}
            for did, name, count, value in dept_stats
        ],
        "entities": entities,
        "expiry_by_month": expiry_by_month,
        "recent_ingestion": [ingestion_out(f) for f in recent_ingestion],
        "failed_extractions": [ingestion_out(f) for f in failed],
        # F3: four phases of work were invisible here. Surface the live state of
        # obligations, playbook risk and spend alongside the ingestion view.
        "obligations": _obligation_summary(db, today),
        "risk": _risk_summary(db, statuses),
        "spend": _spend_summary(db, statuses),
    }


def _obligation_summary(db: Session, today: date) -> dict:
    from ..models import ContractMilestone, MilestoneStatus
    rows = (
        db.query(ContractMilestone)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None), Contract.deleted_at.is_(None))
        .all()
    )
    open_rows = [m for m in rows if m.status == MilestoneStatus.PENDING]
    overdue = [m for m in open_rows if m.due_date and m.due_date < today]
    due_30 = [m for m in open_rows
              if m.due_date and today <= m.due_date <= today + timedelta(days=30)]
    by_type: dict[str, int] = {}
    for m in open_rows:
        by_type[m.obligation_type or "other"] = by_type.get(m.obligation_type or "other", 0) + 1
    return {
        "open": len(open_rows), "done": len(rows) - len(open_rows),
        "overdue": len(overdue), "due_30": len(due_30),
        "by_type": [{"type": k, "count": v}
                    for k, v in sorted(by_type.items(), key=lambda x: -x[1])[:6]],
    }


def _risk_summary(db: Session, statuses) -> dict:
    rows = (
        db.query(Contract.risk_level, func.count(Contract.sr_no))
        .filter(Contract.status.in_(statuses), Contract.deleted_at.is_(None),
                Contract.risk_level.isnot(None))
        .group_by(Contract.risk_level)
        .all()
    )
    counts = {lvl: n for lvl, n in rows}
    unscored = (
        db.query(Contract)
        .filter(Contract.status.in_(statuses), Contract.deleted_at.is_(None),
                Contract.risk_scored_at.is_(None))
        .count()
    )
    on_hold = (
        db.query(Contract)
        .filter(Contract.status.in_(statuses), Contract.deleted_at.is_(None),
                Contract.legal_hold.is_(True))
        .count()
    )
    return {"high": counts.get("high", 0), "medium": counts.get("medium", 0),
            "low": counts.get("low", 0), "unscored": unscored, "legal_hold": on_hold}


def _spend_summary(db: Session, statuses) -> dict:
    from ..services.fx import base_currency, rate_map, to_base
    rates = rate_map(db)
    rows = (
        db.query(Contract.currency, func.coalesce(func.sum(Contract.contract_value), 0))
        .filter(Contract.status.in_(statuses), Contract.deleted_at.is_(None),
                Contract.contract_value.isnot(None))
        .group_by(Contract.currency)
        .all()
    )
    total = 0.0
    for cur, val in rows:
        conv = to_base(float(val), cur, rates)
        if conv is not None:
            total += conv
    return {"base_currency": base_currency(db), "under_management": round(total, 2)}
