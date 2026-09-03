from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_viewer
from ..database import get_db
from ..models import Contract, ContractStatus, Department, User, Vendor
from ..serializers import contract_out, vendor_out
from ..services.excel_export import contracts_to_register_xlsx
from ..services.text_search import make_snippet

router = APIRouter(tags=["reports"])


def _xlsx_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _base_query(db: Session):
    return db.query(Contract).filter(Contract.deleted_at.is_(None))


def _value_sum():
    """Summed contract value, NULL-safe — the one expression every value report
    both *returns* and *orders by*.

    SUM() over a group whose values are all NULL is NULL, not 0. These reports
    coalesced that to 0 in the SELECT list but ordered by the raw SUM, so the
    two disagreed — and the disagreement is engine-specific: Postgres sorts
    NULL as greater than any value, so `ORDER BY SUM(x) DESC` put an all-NULL
    group *first*, while SQLite sorts it last. A vendor displaying 0 therefore
    outranked one displaying 2.5M on Postgres only. Ordering by this same
    expression makes the returned order match the returned numbers on both.
    """
    return func.coalesce(func.sum(Contract.contract_value), 0)


def _stats(values: list[float]) -> dict:
    """count / average / median / p90 for a list of day-durations."""
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    if n == 0:
        return {"count": 0, "avg_days": None, "median_days": None, "p90_days": None}
    def pct(p):
        i = min(n - 1, int(round((p / 100) * (n - 1))))
        return round(vals[i], 1)
    return {"count": n, "avg_days": round(sum(vals) / n, 1),
            "median_days": pct(50), "p90_days": pct(90)}


def _days(a, b) -> float | None:
    if a is None or b is None:
        return None
    # Timestamps may be tz-aware (Postgres) or naive (SQLite); normalize to naive.
    if a.tzinfo is not None:
        a = a.replace(tzinfo=None)
    if b.tzinfo is not None:
        b = b.replace(tzinfo=None)
    return max(0.0, (b - a).total_seconds() / 86400.0)


@router.get("/reports/cycle-time")
def cycle_time(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Process analytics: turnaround and time-in-stage across the funnel, plus
    in-flight aging by draft stage (bottlenecks)."""
    from ..models import (
        Approval, AuditLog, ContractDraft, DraftStatus, ESignEnvelope,
    )
    from ..models import utcnow as _utcnow
    now = _utcnow()

    # 1. Validation turnaround: ingested/created → validated.
    validated = (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None), Contract.validated_at.isnot(None))
        .all()
    )
    validation = _stats([_days(c.created_at, c.validated_at) for c in validated])

    # 2. Approval decision time, per gate.
    appr_rows = db.query(Approval).filter(Approval.decided_at.isnot(None)).all()
    by_gate: dict[str, list] = {}
    for a in appr_rows:
        by_gate.setdefault(a.gate, []).append(_days(a.created_at, a.decided_at))
    approvals = {"overall": _stats([d for v in by_gate.values() for d in v]),
                 "by_gate": {g: _stats(v) for g, v in sorted(by_gate.items())}}

    # 3. Signature turnaround: envelope sent → completed.
    envs = db.query(ESignEnvelope).filter(ESignEnvelope.completed_at.isnot(None)).all()
    signature = _stats([_days(e.created_at, e.completed_at) for e in envs])

    # 4. Authoring → execution: draft created → linked contract validated.
    executed = (
        db.query(ContractDraft)
        .filter(ContractDraft.contract_id.isnot(None))
        .all()
    )
    a2e = []
    for d in executed:
        c = db.get(Contract, d.contract_id)
        if c is not None:
            a2e.append(_days(d.created_at, c.validated_at or c.created_at))
    authoring_to_execution = _stats(a2e)

    # 5. Time-in-stage from recorded draft STATUS_CHANGE transitions.
    events = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "contract_draft", AuditLog.action == "STATUS_CHANGE")
        .order_by(AuditLog.entity_id, AuditLog.created_at)
        .all()
    )
    dwell: dict[str, list] = {}
    per_draft: dict[int, list] = {}
    for ev in events:
        per_draft.setdefault(ev.entity_id, []).append(ev)
    for did, evs in per_draft.items():
        d = db.get(ContractDraft, did)
        start = d.created_at if d else None
        prev_status, prev_time = "DRAFT", start
        for ev in evs:
            if prev_time is not None:
                dwell.setdefault(ev.old_value or prev_status, []).append(_days(prev_time, ev.created_at))
            prev_status, prev_time = ev.new_value, ev.created_at
    stage_durations = {s: _stats(v) for s, v in sorted(dwell.items())}

    # 6. In-flight aging: open drafts by current stage, count + avg age.
    open_drafts = (
        db.query(ContractDraft)
        .filter(ContractDraft.contract_id.is_(None), ContractDraft.deleted_at.is_(None),
                ContractDraft.status.notin_([DraftStatus.EXECUTED, DraftStatus.ABANDONED]))
        .all()
    )
    inflight: dict[str, list] = {}
    for d in open_drafts:
        inflight.setdefault(d.status.value, []).append(_days(d.updated_at, now) or 0.0)
    in_flight = [
        {"stage": s, "count": len(v), "avg_age_days": round(sum(v) / len(v), 1) if v else 0,
         "max_age_days": round(max(v), 1) if v else 0}
        for s, v in sorted(inflight.items(), key=lambda kv: -(sum(kv[1]) / len(kv[1]) if kv[1] else 0))
    ]

    return {
        "validation": validation,
        "approvals": approvals,
        "signature": signature,
        "authoring_to_execution": authoring_to_execution,
        "stage_durations": stage_durations,
        "in_flight": in_flight,
    }


@router.get("/reports/register")
def register_export(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    contracts = _base_query(db).order_by(Contract.sr_no).all()
    return _xlsx_response(contracts_to_register_xlsx(contracts), "contract_register.xlsx")


@router.get("/reports/expiry")
def expiry_report(days: int = 90, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    today = date.today()
    contracts = (
        _base_query(db)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.end_date.isnot(None))
        .filter(Contract.end_date <= today + timedelta(days=days))
        .order_by(Contract.end_date)
        .all()
    )
    return _xlsx_response(
        contracts_to_register_xlsx(contracts, title=f"Expiring in {days} days"),
        f"expiry_report_{days}d.xlsx",
    )


@router.get("/reports/department/{dept_id}")
def department_report(dept_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    dept = db.get(Department, dept_id)
    if dept is None:
        raise HTTPException(404, "Department not found")
    contracts = _base_query(db).filter(Contract.department_id == dept_id).order_by(Contract.sr_no).all()
    return _xlsx_response(
        contracts_to_register_xlsx(contracts, title=dept.name), f"department_{dept_id}_report.xlsx"
    )


@router.get("/reports/vendor-spend")
def vendor_spend(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = (
        db.query(
            Vendor.id,
            Vendor.name,
            func.count(Contract.sr_no),
            _value_sum(),
        )
        .join(Contract, Contract.vendor_id == Vendor.id)
        .filter(Contract.deleted_at.is_(None))
        .group_by(Vendor.id, Vendor.name)
        .order_by(_value_sum().desc(), Vendor.name)
        .all()
    )
    return [
        {"vendor_id": vid, "vendor": name, "contract_count": count, "total_value": float(value)}
        for vid, name, count, value in rows
    ]


@router.get("/reports/value-analytics")
def value_analytics(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Contract-value analytics over active (validated, non-deleted) contracts:
    totals, value by department and by type, top vendors, and the value of
    contracts expiring per month over the next 12 months."""
    from ..models import ContractStatus as CS
    from ..models import LifecycleStatus

    active = (
        _base_query(db)
        .filter(Contract.status == CS.VALIDATED)
        .filter(Contract.lifecycle_status.in_([LifecycleStatus.ACTIVE, LifecycleStatus.EXPIRED]))
    )

    total_value = float(active.with_entities(func.coalesce(func.sum(Contract.contract_value), 0)).scalar() or 0)
    total_count = active.count()

    by_department = [
        {"label": name or "(unassigned)", "value": float(value or 0), "count": count}
        for name, count, value in (
            active.outerjoin(Department, Contract.department_id == Department.id)
            .with_entities(Department.name, func.count(Contract.sr_no), _value_sum())
            .group_by(Department.name)
            .order_by(_value_sum().desc(), Department.name)
            .all()
        )
    ]

    by_type = [
        {"label": ctype or "(untyped)", "value": float(value or 0), "count": count}
        for ctype, count, value in (
            active.with_entities(Contract.contract_type, func.count(Contract.sr_no), _value_sum())
            .group_by(Contract.contract_type)
            .order_by(_value_sum().desc(), Contract.contract_type)
            .all()
        )
    ]

    top_vendors = [
        {"vendor_id": vid, "label": name, "value": float(value or 0), "count": count}
        for vid, name, count, value in (
            active.join(Vendor, Contract.vendor_id == Vendor.id)
            .with_entities(Vendor.id, Vendor.name, func.count(Contract.sr_no), _value_sum())
            .group_by(Vendor.id, Vendor.name)
            # The name is a tie-break, not decoration: without a deterministic
            # second key, *which* vendors survive LIMIT 10 can differ between
            # two identical requests once several share a value.
            .order_by(_value_sum().desc(), Vendor.name)
            .limit(10)
            .all()
        )
    ]

    # Value of contracts expiring per month for the next 12 months
    today = date.today()
    month_keys = []
    y, mo = today.year, today.month
    for _i in range(12):
        month_keys.append(f"{y:04d}-{mo:02d}")
        mo += 1
        if mo > 12:
            mo, y = 1, y + 1
    month_value = {k: 0.0 for k in month_keys}
    for c in active.filter(Contract.end_date.isnot(None)).filter(Contract.end_date >= today).all():
        key = c.end_date.strftime("%Y-%m")
        if key in month_value and c.contract_value is not None:
            month_value[key] += float(c.contract_value)
    expiring_value_by_month = [{"month": k, "value": month_value[k]} for k in month_keys]

    return {
        "total_value": total_value,
        "total_count": total_count,
        "by_department": by_department,
        "by_type": by_type,
        "top_vendors": top_vendors,
        "expiring_value_by_month": expiring_value_by_month,
    }


@router.get("/reports/vendor-concentration")
def vendor_concentration(
    threshold: float = 0.2, db: Session = Depends(get_db), _: User = Depends(require_viewer)
):
    """Vendor spend concentration / dependency risk over active contracts:
    each vendor's share of total value, the Herfindahl-Hirschman Index (HHI),
    how many vendors make up 80% of spend, and vendors above a share threshold."""
    from ..models import ContractStatus as CS
    from ..models import LifecycleStatus

    rows = (
        db.query(Vendor.id, Vendor.name, _value_sum(), func.count(Contract.sr_no))
        .join(Contract, Contract.vendor_id == Vendor.id)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.status == CS.VALIDATED)
        .filter(Contract.lifecycle_status.in_([LifecycleStatus.ACTIVE, LifecycleStatus.EXPIRED]))
        .filter(Contract.contract_value.isnot(None))
        .group_by(Vendor.id, Vendor.name)
        .order_by(_value_sum().desc(), Vendor.name)
        .all()
    )
    total = float(sum(float(v) for _, _, v, _ in rows)) or 0.0

    vendors = []
    cumulative = 0.0
    vendors_for_80 = 0
    hhi = 0.0
    reached_80 = False
    for vid, name, value, count in rows:
        value = float(value)
        share = (value / total) if total else 0.0
        cumulative += share
        hhi += share * share
        if not reached_80:
            vendors_for_80 += 1
            if cumulative >= 0.8:
                reached_80 = True
        vendors.append({
            "vendor_id": vid, "vendor": name, "value": value,
            "contract_count": count, "share": round(share, 4),
            "cumulative_share": round(cumulative, 4),
            "over_threshold": share >= threshold,
        })

    return {
        "total_value": total,
        "vendor_count": len(vendors),
        "hhi": round(hhi, 4),                 # 0..1; >0.25 is highly concentrated
        "top_share": vendors[0]["share"] if vendors else 0.0,
        "vendors_for_80pct": vendors_for_80,  # fewer = more concentrated
        "threshold": threshold,
        "vendors": vendors,
    }


@router.get("/search")
def global_search(q: str, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Global search across vendors, PO numbers, departments and contract services."""
    like = f"%{q}%"
    vendors = (
        db.query(Vendor)
        .filter(Vendor.deleted_at.is_(None))
        .filter(Vendor.name.ilike(like) | Vendor.normalized_name.ilike(like))
        .limit(10)
        .all()
    )
    contracts = (
        _base_query(db)
        .outerjoin(Vendor, Contract.vendor_id == Vendor.id)
        .outerjoin(Department, Contract.department_id == Department.id)
        .filter(
            Contract.po_number.ilike(like)
            | Contract.contract_service.ilike(like)
            | Contract.vendor_name_raw.ilike(like)
            | Vendor.name.ilike(like)
            | Department.name.ilike(like)
        )
        .limit(25)
        .all()
    )
    # Full-text matches in the extracted document body, with a snippet
    contract_ids = {c.sr_no for c in contracts}
    text_hits = (
        _base_query(db)
        .filter(Contract.extracted_text.ilike(like))
        .filter(Contract.sr_no.notin_(contract_ids) if contract_ids else True)
        .limit(15)
        .all()
    )
    text_matches = [
        {**contract_out(c), "snippet": make_snippet(c.extracted_text, q)}
        for c in text_hits
    ]
    # F6: search reaches the rest of the system too — an in-flight draft, a
    # clause in the library and an open obligation are all things people look for
    # by name, and previously none of them were findable here.
    from ..models import ClauseLibraryEntry, ClauseVersion, ContractDraft, ContractMilestone

    drafts = (
        db.query(ContractDraft)
        .filter(ContractDraft.deleted_at.is_(None))
        .filter(ContractDraft.title.ilike(like) | ContractDraft.contract_type.ilike(like))
        .order_by(ContractDraft.updated_at.desc())
        .limit(10)
        .all()
    )
    clauses = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.deleted_at.is_(None), ClauseLibraryEntry.deleted_at.is_(None))
        .filter(ClauseVersion.text.ilike(like) | ClauseLibraryEntry.clause_type.ilike(like))
        .order_by(ClauseVersion.usage_count.desc())
        .limit(10)
        .all()
    )
    obligations = (
        db.query(ContractMilestone)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None), Contract.deleted_at.is_(None))
        .filter(ContractMilestone.title.ilike(like))
        .order_by(ContractMilestone.due_date.is_(None), ContractMilestone.due_date)
        .limit(10)
        .all()
    )
    return {
        "vendors": [vendor_out(v) for v in vendors],
        "contracts": [contract_out(c) for c in contracts],
        "text_matches": text_matches,
        "drafts": [{"id": d.id, "title": d.title, "contract_type": d.contract_type,
                    "status": d.status.value} for d in drafts],
        "clauses": [{"id": v.id, "clause_type": v.entry.clause_type, "label": v.label,
                     "playbook_tier": v.playbook_tier,
                     "snippet": (v.text or "")[:180]} for v in clauses],
        "obligations": [{"id": m.id, "contract_id": m.contract_id, "title": m.title,
                         "obligation_type": m.obligation_type, "status": m.status.value,
                         "due_date": m.due_date.isoformat() if m.due_date else None}
                        for m in obligations],
    }
