"""Portfolio intelligence (Phase J): structured clause filters, risk trending
and bulk AI operations."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, load_only

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import Contract, ContractStatus, User
from ..services.clause_attributes import ATTRIBUTES, matches_filter

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

_OPS = {"eq", "lt", "lte", "gt", "gte", "exists", "missing"}

# These endpoints answer questions about extracted attributes, so they have no
# use for the contract body — and `extracted_text` is the largest column in the
# schema. Naming the columns keeps a portfolio query from pulling megabytes per
# row across the wire to look at a small JSON blob.
_LIST_COLUMNS = (Contract.sr_no, Contract.signing_entity, Contract.vendor_name_raw,
                 Contract.contract_type, Contract.end_date, Contract.risk_level,
                 Contract.clause_attributes)

# Upper bound on rows one request will examine. The filters run in Python, so
# without this the cost of a query grows with the repository forever.
_SCAN_CAP = 5000


class AttrFilter(BaseModel):
    key: str
    op: str = "exists"
    value: object | None = None


class AttrQuery(BaseModel):
    filters: list[AttrFilter] = []
    limit: int = 200


def _validated(db: Session):
    return (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None))
    )


@router.get("/attributes")
def list_attributes(_: User = Depends(require_viewer)):
    """The clause attributes that can be filtered on (J1)."""
    return {"attributes": [
        {"key": k, "concept": concept, "label": label}
        for k, (concept, label) in sorted(ATTRIBUTES.items())
    ], "operators": sorted(_OPS)}


@router.post("/extract-attributes")
def extract_attributes_batch(limit: int = 500, refresh: bool = False,
                             db: Session = Depends(get_db),
                             user: User = Depends(require_validator)):
    """Populate structured clause attributes across the repository (resumable)."""
    from ..services.clause_attributes import extract_attributes
    q = _validated(db)
    if not refresh:
        q = q.filter(Contract.clause_attributes.is_(None))
    rows = q.order_by(Contract.sr_no).limit(min(limit, 2000)).all()
    for c in rows:
        c.clause_attributes = extract_attributes(c.extracted_text or "")
    db.flush()
    remaining = _validated(db).filter(Contract.clause_attributes.is_(None)).count()
    log_action(db, "contract", 0, "EXTRACT_ATTRIBUTES", user_id=user.id, new_value=str(len(rows)))
    db.commit()
    return {"processed": len(rows), "remaining": remaining}


@router.post("/query")
def query_by_attributes(payload: AttrQuery, db: Session = Depends(get_db),
                        _: User = Depends(require_viewer)):
    """Filter contracts by structured clause values (J1).

    “Every contract with uncapped liability” becomes
    `{"key": "liability_capped", "op": "eq", "value": false}` — a filter over
    extracted data, not a text search that might match a clause saying the
    opposite.
    """
    for f in payload.filters:
        if f.op not in _OPS:
            raise HTTPException(400, f"op must be one of {sorted(_OPS)}")
        if f.key not in ATTRIBUTES:
            raise HTTPException(400, f"unknown attribute '{f.key}'")

    q = _validated(db).options(load_only(*_LIST_COLUMNS))
    # Narrow in SQL before reading anything into Python. Every filter except
    # "missing" requires the attribute to be present, and that much the database
    # can decide on its own. The comparison itself stays in Python — pushing a
    # superset down keeps the SQL and the matcher from disagreeing about types.
    for f in payload.filters:
        if f.op != "missing":
            # `.as_string()` matters: indexing the JSON column without it emits
            # JSON_QUOTE(JSON_EXTRACT(...)) on SQLite, and JSON_QUOTE(NULL)
            # returns the *string* 'null', so IS NOT NULL was true for every
            # row and the filter narrowed nothing. Postgres was unaffected,
            # which is exactly how this would have reached production unnoticed.
            q = q.filter(Contract.clause_attributes.isnot(None),
                         Contract.clause_attributes[f.key].as_string().isnot(None))

    limit = min(payload.limit, 500)
    matched, scanned = [], 0
    # Bounded so one request cannot read the whole repository, however the
    # filters land.
    for c in q.order_by(Contract.sr_no).limit(_SCAN_CAP).yield_per(200):
        scanned += 1
        attrs = c.clause_attributes or {}
        if all(matches_filter(attrs, f.key, f.op, f.value) for f in payload.filters):
            matched.append(c)
            if len(matched) >= limit:
                break

    keys = [f.key for f in payload.filters] or sorted(ATTRIBUTES)
    return {
        "total": len(matched),
        "scanned": scanned,
        "truncated": len(matched) >= limit or scanned >= _SCAN_CAP,
        "unextracted": _validated(db).filter(Contract.clause_attributes.is_(None)).count(),
        "items": [{
            "sr_no": c.sr_no,
            "vendor_name": c.signing_entity or c.vendor_name_raw,
            "contract_type": c.contract_type,
            "end_date": c.end_date.isoformat() if c.end_date else None,
            "risk_level": c.risk_level,
            "attributes": {k: (c.clause_attributes or {}).get(k) for k in keys},
        } for c in matched],
    }


@router.get("/exposure")
def exposure(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Where the portfolio's contractual exposure actually sits (J2)."""
    # Only rows carrying extracted attributes contribute to any figure here, so
    # the rest are counted in SQL rather than loaded and discarded.
    total = _validated(db).count()
    with_attrs = (
        _validated(db)
        .filter(Contract.clause_attributes.isnot(None))
        .options(load_only(Contract.sr_no, Contract.clause_attributes,
                           Contract.contract_value, Contract.currency))
        .all()
    )

    def _count(key, predicate):
        return sum(1 for c in with_attrs
                   if key in (c.clause_attributes or {})
                   and predicate((c.clause_attributes or {})[key].get("value")))

    uncapped = _count("liability_capped", lambda v: v is False)
    auto_renew = _count("auto_renews", lambda v: v is True)
    long_notice = _count("notice_days", lambda v: isinstance(v, (int, float)) and v >= 90)
    us_indemnifies = _count("indemnity_direction", lambda v: v == "us_to_vendor")

    # Value sitting behind the riskiest terms, in the base currency.
    from ..services.fx import base_currency, rate_map, to_base
    rates = rate_map(db)
    uncapped_value = 0.0
    for c in with_attrs:
        entry = (c.clause_attributes or {}).get("liability_capped")
        if entry and entry.get("value") is False and c.contract_value is not None:
            conv = to_base(float(c.contract_value), c.currency, rates)
            if conv:
                uncapped_value += conv

    return {
        "total": total, "with_attributes": len(with_attrs),
        "base_currency": base_currency(db),
        "uncapped_liability": {"count": uncapped, "value_in_base": round(uncapped_value, 2)},
        "auto_renewing": auto_renew,
        "long_notice_90d_plus": long_notice,
        "we_indemnify_them": us_indemnifies,
    }


@router.get("/risk-trend")
def risk_trend(months: int = Query(12, ge=1, le=36), db: Session = Depends(get_db),
               _: User = Depends(require_viewer)):
    """Playbook risk over time (J2), bucketed by the month a contract was
    validated — so a drift toward riskier terms is visible, not just today's mix."""
    today = date.today()
    start = (today.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)
    rows = (
        _validated(db)
        .filter(Contract.risk_level.isnot(None), Contract.validated_at.isnot(None))
        .all()
    )
    buckets: dict[str, dict] = {}
    for c in rows:
        when = c.validated_at.date() if hasattr(c.validated_at, "date") else c.validated_at
        if when is None or when < start:
            continue
        key = f"{when.year:04d}-{when.month:02d}"
        b = buckets.setdefault(key, {"month": key, "high": 0, "medium": 0, "low": 0, "total": 0})
        b[c.risk_level] = b.get(c.risk_level, 0) + 1
        b["total"] += 1
    series = []
    for key in sorted(buckets):
        b = buckets[key]
        b["high_pct"] = round(100 * b["high"] / b["total"]) if b["total"] else 0
        series.append(b)
    return {"months": months, "series": series,
            "current": {
                "high": sum(1 for c in rows if c.risk_level == "high"),
                "medium": sum(1 for c in rows if c.risk_level == "medium"),
                "low": sum(1 for c in rows if c.risk_level == "low"),
            }}


class BulkAiRequest(BaseModel):
    operation: str          # summarize | obligations | risk | attributes
    limit: int = 200
    refresh: bool = False


@router.post("/bulk-ai")
def bulk_ai(payload: BulkAiRequest, db: Session = Depends(get_db),
            user: User = Depends(require_validator)):
    """Run an AI operation across the repository in resumable batches (J3).

    Each call is bounded and reports what remains, so a large repository is
    processed by repeated calls rather than one request that times out.
    """
    op = (payload.operation or "").strip().lower()
    limit = min(max(payload.limit, 1), 1000)

    from ..services.clause_attributes import extract_attributes
    from ..services.contract_ai import index_contract, stale_index_query
    from ..services.obligations import extract_obligations
    from ..services.playbook import score_contract

    if op == "summarize":
        rows = (stale_index_query(db).filter(Contract.status == ContractStatus.VALIDATED)
                .order_by(Contract.sr_no).limit(limit).all())
        for c in rows:
            index_contract(db, c)
        db.flush()
        remaining = stale_index_query(db).filter(
            Contract.status == ContractStatus.VALIDATED).count()
    elif op == "obligations":
        from ..models import ContractMilestone
        done_ids = {m.contract_id for m in db.query(ContractMilestone.contract_id)
                    .filter(ContractMilestone.ai_generated.is_(True),
                            ContractMilestone.deleted_at.is_(None)).all()}
        q = _validated(db)
        if not payload.refresh and done_ids:
            q = q.filter(Contract.sr_no.notin_(done_ids))
        rows = q.order_by(Contract.sr_no).limit(limit).all()
        for c in rows:
            extract_obligations(db, c)
        db.flush()
        remaining = max(0, _validated(db).count() - len(done_ids) - len(rows))
    elif op == "risk":
        q = _validated(db)
        if not payload.refresh:
            q = q.filter(Contract.risk_scored_at.is_(None))
        rows = q.order_by(Contract.sr_no).limit(limit).all()
        for c in rows:
            score_contract(db, c)
        db.flush()
        remaining = _validated(db).filter(Contract.risk_scored_at.is_(None)).count()
    elif op == "attributes":
        q = _validated(db)
        if not payload.refresh:
            q = q.filter(Contract.clause_attributes.is_(None))
        rows = q.order_by(Contract.sr_no).limit(limit).all()
        for c in rows:
            c.clause_attributes = extract_attributes(c.extracted_text or "")
        db.flush()
        remaining = _validated(db).filter(Contract.clause_attributes.is_(None)).count()
    else:
        raise HTTPException(400, "operation must be summarize, obligations, risk or attributes")

    log_action(db, "contract", 0, "BULK_AI", user_id=user.id,
               field=op, new_value=str(len(rows)))
    db.commit()
    return {"operation": op, "processed": len(rows), "remaining": remaining,
            "done": remaining == 0}
