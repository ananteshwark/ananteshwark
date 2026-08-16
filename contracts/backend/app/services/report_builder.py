"""Custom report builder (G8): run a saved ReportDefinition (filters + columns)
over the contract repository, render rows, and export CSV. Column and filter
sets are whitelisted so a definition can never reach arbitrary attributes."""
from __future__ import annotations

import csv
import io
from datetime import date

from sqlalchemy.orm import Session, defer, joinedload, selectinload

from ..models import Contract, ContractStatus

# A report is something a person reads or exports; past this many rows it is a
# data dump, and an unbounded one used to be assembled entirely in memory.
MAX_ROWS = 10000

# key -> (label, accessor(contract) -> value). Custom fields are handled
# separately with a "cf_<key>" convention.
COLUMNS: dict[str, tuple[str, object]] = {
    "sr_no": ("Sr No", lambda c: c.sr_no),
    "vendor_name": ("Counterparty", lambda c: c.signing_entity or c.vendor_name_raw),
    "contract_type": ("Type", lambda c: c.contract_type),
    "department": ("Department", lambda c: c.department.name if c.department else None),
    "status": ("Status", lambda c: c.status.value if c.status else None),
    "start_date": ("Start", lambda c: c.start_date.isoformat() if c.start_date else None),
    "end_date": ("End", lambda c: c.end_date.isoformat() if c.end_date else None),
    "contract_value": ("Value", lambda c: float(c.contract_value) if c.contract_value is not None else None),
    "currency": ("Currency", lambda c: c.currency),
    "savings_amount": ("Savings", lambda c: float(c.savings_amount) if c.savings_amount is not None else None),
    "contract_service": ("Service", lambda c: c.contract_service),
    "payment_term": ("Payment term", lambda c: c.payment_term),
    "notice_period": ("Notice period", lambda c: c.notice_period),
    "days_to_expiry": ("Days to expiry",
                       lambda c: (c.end_date - date.today()).days if c.end_date else None),
}

DEFAULT_COLUMNS = ["sr_no", "vendor_name", "contract_type", "department", "status",
                   "end_date", "contract_value", "currency"]


def _label(key: str) -> str:
    if key in COLUMNS:
        return COLUMNS[key][0]
    if key.startswith("cf_"):
        return key[3:].replace("_", " ").title()
    return key


def _value(c: Contract, key: str):
    if key in COLUMNS:
        return COLUMNS[key][1](c)
    if key.startswith("cf_"):
        return (c.custom_fields or {}).get(key[3:])
    return None


def _apply_filters(query, db: Session, f: dict):
    f = f or {}
    if f.get("status"):
        try:
            query = query.filter(Contract.status == ContractStatus(f["status"]))
        except ValueError:
            pass
    else:
        # Default to validated contracts unless a status is explicitly requested.
        query = query.filter(Contract.status == ContractStatus.VALIDATED)
    if f.get("contract_type"):
        query = query.filter(Contract.contract_type == f["contract_type"])
    if f.get("department_id"):
        query = query.filter(Contract.department_id == int(f["department_id"]))
    if f.get("vendor_id"):
        query = query.filter(Contract.vendor_id == int(f["vendor_id"]))
    if f.get("value_min") is not None:
        query = query.filter(Contract.contract_value >= float(f["value_min"]))
    if f.get("value_max") is not None:
        query = query.filter(Contract.contract_value <= float(f["value_max"]))
    if f.get("expiring_within_days") is not None:
        from datetime import timedelta
        cutoff = date.today() + timedelta(days=int(f["expiring_within_days"]))
        query = query.filter(Contract.end_date.isnot(None), Contract.end_date <= cutoff,
                             Contract.end_date >= date.today())
    return query


def run_report(db: Session, definition) -> dict:
    """Return {columns:[{key,label}], rows:[[...]], total} for a definition."""
    cols = [c for c in (definition.columns or DEFAULT_COLUMNS)
            if c in COLUMNS or c.startswith("cf_")]
    if not cols:
        cols = DEFAULT_COLUMNS

    query = (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None))
        # No report column reads the contract body, and it is the largest column
        # in the schema — deferring it keeps a report over the whole repository
        # from dragging every document into memory. Department and tags are the
        # two accessors that leave the row, so they are loaded up front rather
        # than one query at a time.
        .options(defer(Contract.extracted_text),
                 joinedload(Contract.department),
                 selectinload(Contract.tags))
    )
    query = _apply_filters(query, db, definition.filters or {})

    tag_id = (definition.filters or {}).get("tag_id")
    rows_c = query.limit(MAX_ROWS).all()
    if tag_id:
        rows_c = [c for c in rows_c if any(t.id == int(tag_id) for t in getattr(c, "tags", []) or [])]

    sort_key = definition.sort if (definition.sort in COLUMNS or (definition.sort or "").startswith("cf_")) else None
    if sort_key:
        rows_c.sort(key=lambda c: (_value(c, sort_key) is None, _value(c, sort_key)))

    rows = [[_value(c, k) for k in cols] for c in rows_c]
    return {
        "columns": [{"key": k, "label": _label(k)} for k in cols],
        "rows": rows, "total": len(rows),
    }


def report_to_csv(result: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c["label"] for c in result["columns"]])
    for row in result["rows"]:
        w.writerow(["" if v is None else v for v in row])
    return buf.getvalue()


def available_columns() -> list[dict]:
    return [{"key": k, "label": v[0]} for k, v in COLUMNS.items()]
