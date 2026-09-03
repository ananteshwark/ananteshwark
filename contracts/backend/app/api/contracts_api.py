from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from ..services.file_serving import safe_file_response
from sqlalchemy.orm import Session

from ..audit import log_action, log_field_changes
from ..auth import require_super_admin, require_validator, require_viewer
from ..config import settings
from ..database import get_db
from ..models import (
    AuditLog,
    Contract,
    ContractAttachment,
    ContractNote,
    ContractRecipient,
    ContractStatus,
    Department,
    DuplicateCandidate,
    ContractMilestone,
    IngestionFile,
    IngestionStatus,
    LifecycleStatus,
    MilestoneStatus,
    Tag,
    User,
    UserRole,
    Vendor,
    utcnow,
)
from ..schemas import (
    AssigneeUpdate,
    BulkContractAction,
    ContractUpdate,
    LifecycleRequest,
    LinkDocument,
    MilestoneIn,
    MilestoneUpdate,
    NoteIn,
    RecipientsUpdate,
    RejectRequest,
    ReminderOverride,
    SnoozeRequest,
    TagAssign,
    ValidateRequest,
)
from ..serializers import contract_completeness as _completeness, contract_out
from ..services.dates import derive_dates, normalize_tenure, tenure_from_dates
from ..services.duplicates import ContractFacts, find_duplicates
from ..services.internal_entities import resolve_signing_entity
from ..services.vendor_matching import normalize_vendor_name

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contracts", tags=["contracts"])

MANDATORY_FIELDS = [
    ("signing_entity", "Signing Entity"),
    ("vendor", "Vendor"),
    ("start_date", "Start Date"),
    ("end_date", "End Date"),
    ("department_id", "Department"),
    ("contract_service", "Contract Service"),
    ("po_number", "PO Number"),
]



def _facts(c: Contract) -> ContractFacts:
    return ContractFacts(
        sr_no=c.sr_no,
        vendor_name=c.vendor.name if c.vendor else c.vendor_name_raw,
        signing_entity=c.signing_entity,
        po_number=c.po_number,
        contract_service=c.contract_service,
        start_date=c.start_date,
        end_date=c.end_date,
        contract_type=c.contract_type,
        location=c.location,
    )


def _missing_mandatory(contract: Contract) -> list[str]:
    missing = []
    for field, label in MANDATORY_FIELDS:
        if field == "vendor":
            if not contract.vendor_id and not contract.vendor_name_raw:
                missing.append(label)
        elif getattr(contract, field) in (None, ""):
            missing.append(label)
    return missing


def _get_contract(db: Session, sr_no: int) -> Contract:
    contract = db.get(Contract, sr_no)
    if contract is None or contract.deleted_at is not None:
        raise HTTPException(404, "Contract not found")
    return contract


# Actions that are *about* the hold, or that don't alter the preserved record,
# stay available while a contract is held: reading, scoring, releasing the hold.
def _assert_writable(contract: Contract) -> Contract:
    """Reject a write to a contract under legal hold.

    A hold means the record is preserved as-is for litigation or audit, so it
    has to cover every path that mutates it — not only the obvious edit and
    delete. Validation, milestones, tags, assignee, notes and attachments all
    change what the record says or how it is filed.
    """
    if contract.legal_hold:
        raise HTTPException(
            423, "Contract is under legal hold and cannot be modified. "
                 "Release the hold first.")
    return contract


def _get_contract_for_write(db: Session, sr_no: int) -> Contract:
    return _assert_writable(_get_contract(db, sr_no))


def _expire_due(db: Session) -> bool:
    """Flip any contract past its end date to EXPIRED. Returns True if any changed."""
    from ..services.lifecycle import sweep_expired
    return sweep_expired(db) > 0


def _autolearn_clauses(db: Session, contract: Contract) -> None:
    """Best-effort: feed a newly validated contract's clauses into the library so
    it grows automatically (deterministic segmentation; controlled by a setting)."""
    try:
        from ..services.settings_store import get_setting
        from ..services.clauses import learn_from_contract, segment_and_classify
        if (get_setting(db, "clause_autolearn") or "true") == "false":
            return
        if not contract.extracted_text:
            return
        learn_from_contract(db, contract, use_ai=False)
        # Keep each touched clause type capped at 5 most-used versions (retire the
        # rest). Deterministic + no AI polish so it stays fast on the request path.
        from ..services.clause_curation import curate_library
        types = {c["clause_type"] for c in segment_and_classify(contract.extracted_text)}
        for ct in types:
            curate_library(db, clause_type=ct, compact=True, polish=False)
    except Exception:  # never block validation on library upkeep
        # Validation still succeeds, but the clause library quietly stops
        # growing — which looks like the autolearn setting not working.
        logger.warning("Clause autolearn failed for contract %s", contract.sr_no,
                       exc_info=True)


def _snapshot(c: Contract) -> dict:
    return {f: getattr(c, f) for f in [
        "signing_entity", "vendor_id", "vendor_name_raw", "vendor_address", "start_date",
        "end_date", "contract_tenure", "department_id", "po_number", "contract_value",
        "currency", "iks_signing_authority", "vendor_signing_authority",
        "contract_service", "service_summary", "payment_term", "notice_period",
        "contract_type", "location",
    ]}


def _apply_update(db: Session, contract: Contract, payload: ContractUpdate, user: User) -> None:
    # Every field write funnels through here, including validation — so the
    # legal-hold guard belongs here rather than on individual endpoints.
    _assert_writable(contract)
    old = _snapshot(contract)

    data = payload.model_dump(exclude_unset=True, exclude={"force", "new_vendor_name"})
    # Vendor attach / create
    if payload.new_vendor_name:
        vendor = Vendor(
            name=payload.new_vendor_name,
            normalized_name=normalize_vendor_name(payload.new_vendor_name),
        )
        db.add(vendor)
        db.flush()
        log_action(db, "vendor", vendor.id, "CREATE", user_id=user.id, new_value=vendor.name)
        data["vendor_id"] = vendor.id

    # Field-level permissions (G16): some register fields may be edited only by
    # Legal/Admin. Reject an attempt by anyone else to change one of them.
    from ..auth import user_roles
    from ..services.settings_store import get_setting
    raw = get_setting(db, "restricted_contract_fields") or ""
    restricted = {f.strip() for f in raw.replace("\n", ",").split(",") if f.strip()}
    if restricted and not ({UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LEGAL} & user_roles(user)):
        blocked = [k for k, v in data.items()
                   if k in restricted and getattr(contract, k, None) != v]
        if blocked:
            raise HTTPException(403, f"These fields are restricted to Legal/Admin: {', '.join(sorted(blocked))}")

    for field, value in data.items():
        setattr(contract, field, value)

    # Keep the signing entity aligned to its predefined master: if the value the
    # user picked/typed resolves to a known entity, store that entity's canonical
    # name. Applied on every save (not just validate) so Save and Validate agree —
    # no more "saved, then reverted". An unrecognized value is left as-is here and
    # is caught at validation time.
    if "signing_entity" in data:
        canonical, ok = resolve_signing_entity(db, contract.signing_entity)
        if ok and canonical and canonical != contract.signing_entity:
            contract.signing_entity = canonical

    # Re-derive missing dates from tenure
    start, end, derived = derive_dates(contract.start_date, contract.end_date, contract.contract_tenure)
    contract.start_date, contract.end_date = start, end
    if derived:
        contract.derived_fields = sorted(set((contract.derived_fields or []) + derived))

    # Keep tenure in months/years: recompute from the dates when both are known,
    # otherwise normalize whatever was entered.
    contract.contract_tenure = (
        tenure_from_dates(contract.start_date, contract.end_date)
        or normalize_tenure(contract.contract_tenure)
    )

    log_field_changes(db, "contract", contract.sr_no, old, _snapshot(contract), user.id)


@router.get("/validation-queue")
def validation_queue(
    department_id: int | None = None,
    vendor: str | None = None,
    signing_entity: str | None = None,
    assignee_id: int | None = None,  # 0 = unassigned; >0 = that user
    sort: str = "detected_at",
    order: str = "desc",
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    query = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.PENDING_VALIDATION)
        .filter(Contract.deleted_at.is_(None))
    )
    if department_id:
        query = query.filter(Contract.department_id == department_id)
    if signing_entity:
        query = query.filter(Contract.signing_entity == signing_entity)
    if vendor:
        query = query.filter(
            (Contract.vendor_name_raw.ilike(f"%{vendor}%"))
        )
    if assignee_id is not None:
        if assignee_id == 0:
            query = query.filter(Contract.assignee_id.is_(None))
        else:
            query = query.filter(Contract.assignee_id == assignee_id)
    rows = query.all()

    def min_confidence(c: Contract) -> float:
        vals = [v for v in (c.confidence or {}).values() if isinstance(v, (int, float))]
        return min(vals) if vals else 0.0

    keys = {
        "detected_at": lambda c: c.created_at or datetime.min.replace(tzinfo=timezone.utc),
        "department": lambda c: (c.department.name if c.department else ""),
        "vendor": lambda c: (c.vendor.name if c.vendor else (c.vendor_name_raw or "")),
        "confidence": min_confidence,
    }
    rows.sort(key=keys.get(sort, keys["detected_at"]), reverse=(order == "desc"))
    return [
        {**contract_out(c), "min_confidence": min_confidence(c), "completeness": _completeness(c)}
        for c in rows
    ]


def _filtered_contract_query(
    db, status=None, department_id=None, vendor_id=None, q=None, in_text=False,
    expiry_month=None, contract_type=None, tag_id=None, expiring_days=None,
    signing_entity=None, lifecycle_status=None, phi_shared=None,
    risk_level=None, legal_hold=None
):
    # Categorical filters accept a single value or a list; a list matches ANY of
    # its values (OR within a filter, AND across filters). Scalars are wrapped so
    # existing single-value callers/links keep working unchanged.
    def _as_list(v):
        if v is None:
            return []
        if isinstance(v, (list, tuple, set)):
            return [x for x in v if x not in (None, "")]
        return [v] if v != "" else []

    query = db.query(Contract).filter(Contract.deleted_at.is_(None))
    if phi_shared in (True, False):
        query = query.filter(Contract.phi_shared.is_(phi_shared))
    risk_levels = _as_list(risk_level)
    if risk_levels:
        query = query.filter(Contract.risk_level.in_(risk_levels))
    if legal_hold in (True, False):
        query = query.filter(Contract.legal_hold.is_(legal_hold))
    lifecycles = _as_list(lifecycle_status)
    if lifecycles:
        try:
            query = query.filter(Contract.lifecycle_status.in_([LifecycleStatus(x) for x in lifecycles]))
        except ValueError:
            raise HTTPException(400, f"Invalid lifecycle_status: {lifecycle_status}")
    if expiring_days is not None:
        from datetime import timedelta
        today = date.today()
        query = query.filter(
            Contract.end_date >= today,
            Contract.end_date <= today + timedelta(days=int(expiring_days)),
        )
    statuses = _as_list(status)
    if statuses:
        try:
            query = query.filter(Contract.status.in_([ContractStatus(s) for s in statuses]))
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    dept_ids = _as_list(department_id)
    if dept_ids:
        query = query.filter(Contract.department_id.in_([int(x) for x in dept_ids]))
    entities = _as_list(signing_entity)
    if entities:
        query = query.filter(Contract.signing_entity.in_(entities))
    if vendor_id:
        query = query.filter(Contract.vendor_id == vendor_id)
    types = _as_list(contract_type)
    if types:
        query = query.filter(Contract.contract_type.in_(types))
    tag_ids = _as_list(tag_id)
    if tag_ids:
        query = query.filter(Contract.tags.any(Tag.id.in_([int(x) for x in tag_ids])))
    if q:
        like = f"%{q}%"
        clauses = (
            Contract.vendor_name_raw.ilike(like)
            | Vendor.name.ilike(like)
            | Contract.po_number.ilike(like)
            | Contract.contract_service.ilike(like)
            | Contract.signing_entity.ilike(like)
        )
        if in_text:
            clauses = clauses | Contract.extracted_text.ilike(like)
        query = query.outerjoin(Vendor, Contract.vendor_id == Vendor.id).filter(clauses)
    if expiry_month:
        try:
            year, month = map(int, expiry_month.split("-"))
            month_start = date(year, month, 1)
            month_end = date(year + (month == 12), month % 12 + 1, 1)
        except (ValueError, TypeError):
            raise HTTPException(400, "expiry_month must be in YYYY-MM format")
        query = query.filter(Contract.end_date >= month_start, Contract.end_date < month_end)
    return query


# Columns the contracts list can be sorted by (key -> Contract column). "vendor"
# and "department" resolve through joins and are handled specially below.
_SORT_COLUMNS = {
    "sr_no": Contract.sr_no,
    "service": Contract.contract_service,
    "type": Contract.contract_type,
    "location": Contract.location,
    "po": Contract.po_number,
    "start": Contract.start_date,
    "end": Contract.end_date,
    "value": Contract.contract_value,
    "status": Contract.status,
    "lifecycle": Contract.lifecycle_status,
}


def _apply_contract_sort(query, sort: str | None, order: str | None):
    """Order the contracts query by any user-facing column, asc or desc, with a
    stable sr_no tiebreaker. Joined name columns (vendor/department) use aliases
    so they never collide with a filter join."""
    from sqlalchemy import func
    from sqlalchemy.orm import aliased

    descending = (order or "desc").lower() != "asc"
    if sort == "vendor":
        V = aliased(Vendor)
        query = query.outerjoin(V, Contract.vendor_id == V.id)
        col = func.coalesce(V.name, Contract.vendor_name_raw)
    elif sort == "department":
        D = aliased(Department)
        query = query.outerjoin(D, Contract.department_id == D.id)
        col = D.name
    else:
        col = _SORT_COLUMNS.get(sort or "sr_no")
        if col is None:
            col = Contract.sr_no
    primary = col.desc() if descending else col.asc()
    # Blanks sink regardless of direction; sr_no breaks ties deterministically.
    return query.order_by(primary.nulls_last(), Contract.sr_no.desc())


def _with_list_relations(query):
    """Eager-load everything contract_out() reads, to kill the N+1.

    contract_out touches c.vendor, c.department, c.assignee and c.tags. All four
    are lazy, so serializing a page of contracts fired four extra round trips
    *per row*: a 50-row page cost 106 SQL statements, and the default page size
    is 200. The work grew linearly with the page while the query planner never
    saw more than one row at a time.

    selectinload rather than joinedload for all four, including the many-to-one
    ones: it issues one additional IN(...) query per relationship regardless of
    page size, and it cannot interact with the LIMIT/OFFSET or with the aliased
    joins _apply_contract_sort may already have added. A page now costs a fixed
    handful of statements instead of 4N.
    """
    from sqlalchemy.orm import selectinload
    return query.options(
        selectinload(Contract.vendor),
        selectinload(Contract.department),
        selectinload(Contract.assignee),
        selectinload(Contract.tags),
    )


@router.get("")
def list_contracts(
    status: list[str] | None = Query(None),           # repeatable: matches any
    department_id: list[int] | None = Query(None),    # repeatable: matches any
    vendor_id: int | None = None,
    q: str | None = None,
    in_text: bool = False,  # also match the full extracted document text
    expiry_month: str | None = None,  # YYYY-MM: contracts whose end_date falls in that month
    contract_type: list[str] | None = Query(None),    # repeatable: matches any
    tag_id: list[int] | None = Query(None),           # repeatable: matches any
    expiring_days: int | None = None,  # end_date within the next N days (from today)
    signing_entity: list[str] | None = Query(None),   # repeatable: matches any
    lifecycle_status: list[str] | None = Query(None), # repeatable: matches any
    phi_shared: bool | None = None,
    risk_level: list[str] | None = Query(None),       # repeatable: low | medium | high
    legal_hold: bool | None = None,
    sort: str = "sr_no",     # any column key in _SORT_COLUMNS (or vendor/department)
    order: str = "desc",     # "asc" | "desc"
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    if _expire_due(db):
        db.commit()
    query = _filtered_contract_query(
        db, status, department_id, vendor_id, q, in_text, expiry_month, contract_type, tag_id,
        expiring_days, signing_entity, lifecycle_status, phi_shared, risk_level, legal_hold,
    )
    total = query.count()
    # Eager-load after count(): count() wraps the query in a subquery and the
    # loader options would be dead weight on it.
    query = _with_list_relations(_apply_contract_sort(query, sort, order))
    rows = query.limit(min(limit, 500)).offset(offset).all()
    return {"total": total, "items": [contract_out(c) for c in rows]}


@router.get("/export")
def export_contracts(
    status: list[str] | None = Query(None),
    department_id: list[int] | None = Query(None),
    vendor_id: int | None = None,
    q: str | None = None,
    in_text: bool = False,
    expiry_month: str | None = None,
    contract_type: list[str] | None = Query(None),
    tag_id: list[int] | None = Query(None),
    signing_entity: list[str] | None = Query(None),
    lifecycle_status: list[str] | None = Query(None),
    sort: str = "sr_no",
    order: str = "desc",
    fmt: str = "xlsx",   # "xlsx" | "csv"
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    """Export the currently-filtered, currently-sorted contracts view. Honors the
    same sort as the on-screen table; xlsx (default) or csv."""
    from fastapi.responses import Response

    from ..services.excel_export import contracts_to_register_csv, contracts_to_register_xlsx

    query = _filtered_contract_query(
        db, status, department_id, vendor_id, q, in_text, expiry_month, contract_type, tag_id,
        signing_entity=signing_entity, lifecycle_status=lifecycle_status,
    )
    # The export has no LIMIT, so its N+1 was the unbounded one: the whole
    # filtered set, four lazy loads per row.
    rows = _with_list_relations(_apply_contract_sort(query, sort, order)).all()
    if fmt == "csv":
        return Response(
            content=contracts_to_register_csv(rows), media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="contracts_export.csv"'},
        )
    data = contracts_to_register_xlsx(rows, title="Filtered contracts")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="contracts_export.xlsx"'},
    )


@router.get("/calendar.ics")
def contracts_calendar(
    status: list[str] | None = Query(None),
    department_id: list[int] | None = Query(None),
    vendor_id: int | None = None,
    q: str | None = None,
    in_text: bool = False,
    expiry_month: str | None = None,
    contract_type: list[str] | None = Query(None),
    tag_id: list[int] | None = Query(None),
    signing_entity: list[str] | None = Query(None),
    lifecycle_status: list[str] | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    """Export the filtered contracts' expiration dates as an iCalendar (.ics)
    file to import into Google Calendar / Outlook."""
    from fastapi.responses import Response

    from ..services.ics import build_calendar

    query = _filtered_contract_query(
        db, status, department_id, vendor_id, q, in_text, expiry_month, contract_type, tag_id,
        signing_entity=signing_entity, lifecycle_status=lifecycle_status,
    )
    rows = query.filter(Contract.end_date.isnot(None)).order_by(Contract.end_date).all()
    events = []
    for c in rows:
        vendor = (c.vendor.name if c.vendor else None) or c.vendor_name_raw or "(unknown vendor)"
        desc_parts = [f"Contract #{c.sr_no}"]
        if c.contract_service:
            desc_parts.append(f"Service: {c.contract_service}")
        if c.department:
            desc_parts.append(f"Department: {c.department.name}")
        if c.contract_value is not None:
            desc_parts.append(f"Value: {c.currency} {c.contract_value}")
        events.append({
            "uid": f"contract-{c.sr_no}-expiry@cms",
            "date": c.end_date,
            "summary": f"Contract expires: {vendor} (#{c.sr_no})",
            "description": "\n".join(desc_parts),
        })
    ics = build_calendar(events)
    return Response(
        content=ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="contract_expirations.ics"'},
    )


@router.get("/types")
def contract_types(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """The admin-configured contract-type vocabulary for the type dropdowns."""
    from ..services.settings_store import get_setting

    raw = get_setting(db, "contract_types")
    types = [t.strip() for t in raw.replace("\n", ",").split(",") if t.strip()]
    return {"types": types}


@router.get("/mandatory-fields")
def mandatory_fields(_: User = Depends(require_viewer)):
    """Which fields block validation, so the form can mark them.

    Served from `MANDATORY_FIELDS` rather than restated in the client: the two
    lists drifting apart is how a form ends up marking a field the server does
    not require, or worse, staying silent about one it does. `form_field` is the
    name the validation form uses, which differs from the column for the vendor
    (picked by name, stored by id).
    """
    form_names = {"vendor": "vendor_name_raw"}
    return {"mandatory": [
        {"field": f, "form_field": form_names.get(f, f), "label": label}
        for f, label in MANDATORY_FIELDS
    ]}


@router.get("/signing-entities")
def signing_entities(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Distinct signing-entity values across live contracts, for the entity filter."""
    rows = (
        db.query(Contract.signing_entity)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.signing_entity.isnot(None))
        .filter(Contract.signing_entity != "")
        .distinct()
        .all()
    )
    entities = sorted({r[0].strip() for r in rows if r[0] and r[0].strip()}, key=str.lower)
    return {"entities": entities}


@router.post("")
def create_contract(
    payload: ContractUpdate, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Manually create a contract (e.g. a paper contract with no ingested file).

    Enters the normal validation workflow as PENDING_VALIDATION; mandatory fields
    are enforced at validation time, so a partial draft can be saved here.
    """
    contract = Contract(
        status=ContractStatus.PENDING_VALIDATION,
        raw_extracted={},
        confidence={},
        derived_fields=[],
        extraction_model="manual-entry",
    )
    db.add(contract)
    db.flush()
    _apply_update(db, contract, payload, user)  # vendor attach/create + date derivation + audit
    log_action(db, "contract", contract.sr_no, "MANUAL_CREATE", user_id=user.id)
    db.commit()
    out = contract_out(contract, detail=True)
    out["completeness"] = _completeness(contract)
    return out


@router.post("/{sr_no}/upload")
def upload_document(
    sr_no: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    """Attach a scanned/soft-copy document to a manually-created contract."""
    from ..services.upload_guard import ATTACHMENT_EXTS, save_upload
    contract = _get_contract_for_write(db, sr_no)
    dest_dir = Path(settings.MANUAL_UPLOAD_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "document").name
    dest = dest_dir / f"{sr_no}__{safe_name}"
    save_upload(file, dest, allowed_exts=ATTACHMENT_EXTS)
    old_link = contract.contract_link
    contract.contract_link = str(dest.resolve())
    log_action(db, "contract", contract.sr_no, "UPLOAD_DOCUMENT", user_id=user.id,
               field="contract_link", old_value=old_link, new_value=contract.contract_link)
    db.commit()
    out = contract_out(contract, detail=True)
    out["completeness"] = _completeness(contract)
    return out


@router.post("/bulk")
def bulk_action(
    payload: BulkContractAction, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Apply an action to many contracts at once from the validation queue."""
    action = payload.action
    if action not in (
        "assign_department", "assign_rule", "reject", "validate",
        "add_tags", "remove_tags", "set_type", "assign_user", "re_extract"
    ):
        raise HTTPException(400, f"Unknown bulk action: {action}")
    if action == "assign_department" and not payload.department_id:
        raise HTTPException(400, "department_id is required for assign_department")

    bulk_assignee = None
    if action == "assign_user":
        bulk_assignee = _resolve_assignee(db, payload.user_id)

    bulk_tags: list[Tag] = []
    if action in ("add_tags", "remove_tags"):
        ids = list(dict.fromkeys(payload.tag_ids or []))
        if not ids:
            raise HTTPException(400, "tag_ids is required for tag actions")
        bulk_tags = db.query(Tag).filter(Tag.id.in_(ids), Tag.deleted_at.is_(None)).all()
        missing = [i for i in ids if i not in {t.id for t in bulk_tags}]
        if missing:
            raise HTTPException(404, f"Unknown tag id(s): {', '.join(map(str, missing))}")

    updated: list[int] = []
    skipped: list[dict] = []
    requeue: list[int] = []   # ingestion ids to re-extract after commit
    for sr_no in payload.sr_nos:
        contract = db.get(Contract, sr_no)
        if contract is None or contract.deleted_at is not None:
            skipped.append({"sr_no": sr_no, "reason": "not found"})
            continue

        if action == "assign_department":
            log_action(db, "contract", sr_no, "BULK_ASSIGN_DEPARTMENT", user_id=user.id,
                       field="department_id", old_value=contract.department_id, new_value=payload.department_id)
            contract.department_id = payload.department_id
            updated.append(sr_no)
        elif action == "assign_rule":
            log_action(db, "contract", sr_no, "BULK_ASSIGN_RULE", user_id=user.id,
                       field="reminder_rule_id", old_value=contract.reminder_rule_id, new_value=payload.reminder_rule_id)
            contract.reminder_rule_id = payload.reminder_rule_id
            updated.append(sr_no)
        elif action == "reject":
            contract.status = ContractStatus.REJECTED
            contract.rejection_reason = payload.reason or "Bulk rejected"
            log_action(db, "contract", sr_no, "BULK_REJECT", user_id=user.id, new_value=contract.rejection_reason)
            updated.append(sr_no)
        elif action == "validate":
            if contract.status != ContractStatus.PENDING_VALIDATION:
                skipped.append({"sr_no": sr_no, "reason": f"status is {contract.status.value}"})
                continue
            missing = _missing_mandatory(contract)
            if missing:
                skipped.append({"sr_no": sr_no, "reason": f"missing {', '.join(missing)}"})
                continue
            canonical, entity_ok = resolve_signing_entity(db, contract.signing_entity)
            if not entity_ok:
                skipped.append({"sr_no": sr_no, "reason": "signing entity is not a predefined internal entity"})
                continue
            if canonical and canonical != contract.signing_entity:
                contract.signing_entity = canonical
            _run_duplicate_detection(db, contract)  # record candidates for later review
            contract.status = ContractStatus.VALIDATED
            contract.validated_by_id = user.id
            contract.validated_at = datetime.now(timezone.utc)
            if contract.thread_id is None:
                contract.thread_id = contract.sr_no
            if contract.ingestion_file_id:
                ingestion = db.get(IngestionFile, contract.ingestion_file_id)
                if ingestion:
                    ingestion.status = IngestionStatus.VALIDATED
            log_action(db, "contract", sr_no, "BULK_VALIDATE", user_id=user.id)
            updated.append(sr_no)
        elif action in ("add_tags", "remove_tags"):
            before = sorted(t.name for t in contract.tags if t.deleted_at is None)
            current = {t.id: t for t in contract.tags if t.deleted_at is None}
            if action == "add_tags":
                for t in bulk_tags:
                    current[t.id] = t
            else:
                for t in bulk_tags:
                    current.pop(t.id, None)
            new_tags = list(current.values())
            after = sorted(t.name for t in new_tags)
            if before != after:
                contract.tags = new_tags
                log_action(db, "contract", sr_no, "BULK_SET_TAGS", user_id=user.id,
                           old_value=", ".join(before) or None, new_value=", ".join(after) or None)
                updated.append(sr_no)
            else:
                skipped.append({"sr_no": sr_no, "reason": "no tag change"})
        elif action == "set_type":
            new_type = (payload.contract_type or "").strip() or None
            if contract.contract_type == new_type:
                skipped.append({"sr_no": sr_no, "reason": "no type change"})
                continue
            log_action(db, "contract", sr_no, "BULK_SET_TYPE", user_id=user.id,
                       field="contract_type", old_value=contract.contract_type, new_value=new_type)
            contract.contract_type = new_type
            updated.append(sr_no)
        elif action == "assign_user":
            new_id = bulk_assignee.id if bulk_assignee else None
            if contract.assignee_id == new_id:
                skipped.append({"sr_no": sr_no, "reason": "no assignee change"})
                continue
            old = contract.assignee.name if contract.assignee else None
            contract.assignee_id = new_id
            log_action(db, "contract", sr_no, "BULK_ASSIGN_USER", user_id=user.id,
                       field="assignee", old_value=old,
                       new_value=bulk_assignee.name if bulk_assignee else None)
            if bulk_assignee and bulk_assignee.id != user.id:
                from ..services.user_notifications import create_notification
                create_notification(db, bulk_assignee.id, "assignment",
                                    f"You were assigned contract #{sr_no}", f"/contracts/{sr_no}")
            updated.append(sr_no)
        elif action == "re_extract":
            if contract.status != ContractStatus.PENDING_VALIDATION:
                skipped.append({"sr_no": sr_no, "reason": f"status is {contract.status.value}"})
                continue
            ing = db.get(IngestionFile, contract.ingestion_file_id) if contract.ingestion_file_id else None
            if ing is None:
                skipped.append({"sr_no": sr_no, "reason": "no source file to re-extract"})
                continue
            contract.deleted_at = datetime.now(timezone.utc)  # superseded by the fresh extraction
            ing.status = IngestionStatus.QUEUED
            ing.error = None
            ing.contract_id = None
            ing.processed_at = None
            requeue.append(ing.id)
            log_action(db, "contract", sr_no, "BULK_RE_EXTRACT", user_id=user.id)
            updated.append(sr_no)

    db.commit()
    if requeue:
        from ..services.extraction_worker import extraction_queue
        for iid in requeue:
            extraction_queue.put(iid)
    return {"updated": updated, "skipped": skipped, "updated_count": len(updated)}


@router.post("/import")
def import_contracts(
    file: UploadFile = File(...),
    dry_run: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    """Bulk-import contracts from a .xlsx/.csv register file.

    Vendors and departments are matched by name (created if unknown). Rows with
    all mandatory fields are imported as VALIDATED (migration of existing data);
    incomplete rows land in the validation queue. `dry_run=true` previews without
    persisting anything.
    """
    from ..services.contract_import import map_row, parse_rows
    from ..services.upload_guard import IMPORT_EXTS, read_upload
    from ..services.vendor_matching import normalize_vendor_name

    content = read_upload(file, allowed_exts=IMPORT_EXTS)
    try:
        rows = parse_rows(content, file.filename or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if len(rows) > 20000:
        raise HTTPException(400, "Import is limited to 20,000 rows per file")

    vendor_by_norm: dict[str, Vendor] = {}
    for v in db.query(Vendor).filter(Vendor.deleted_at.is_(None)).all():
        vendor_by_norm.setdefault(v.normalized_name, v)
    dept_by_name = {
        d.name.lower(): d
        for d in db.query(Department).filter(Department.deleted_at.is_(None)).all()
    }

    created = validated = pending = 0
    errors: list[dict] = []
    created_vendors: set[str] = set()
    created_departments: set[str] = set()

    for row in rows:
        fields, row_errors = map_row(row)
        if row_errors:
            errors.append({"row": row["_row"], "errors": row_errors})
            continue

        vendor_name = fields.pop("vendor", None)
        dept_name = fields.pop("department", None)
        currency = fields.pop("currency", None) or "INR"

        vendor_id = None
        if vendor_name:
            norm = normalize_vendor_name(vendor_name)
            vendor = vendor_by_norm.get(norm)
            if vendor is None:
                vendor = Vendor(name=vendor_name, normalized_name=norm)
                db.add(vendor)
                db.flush()
                vendor_by_norm[norm] = vendor
                created_vendors.add(vendor_name)
            vendor_id = vendor.id

        department_id = None
        if dept_name:
            dept = dept_by_name.get(dept_name.lower())
            if dept is None:
                dept = Department(name=dept_name)
                db.add(dept)
                db.flush()
                dept_by_name[dept_name.lower()] = dept
                created_departments.add(dept_name)
            department_id = dept.id

        contract = Contract(
            status=ContractStatus.PENDING_VALIDATION,
            raw_extracted={}, confidence={}, derived_fields=[],
            extraction_model="import", currency=currency,
            vendor_id=vendor_id, vendor_name_raw=vendor_name, department_id=department_id,
        )
        for key, val in fields.items():
            setattr(contract, key, val)
        start, end, derived = derive_dates(contract.start_date, contract.end_date, contract.contract_tenure)
        contract.start_date, contract.end_date, contract.derived_fields = start, end, derived
        db.add(contract)
        db.flush()

        if not _missing_mandatory(contract):
            contract.status = ContractStatus.VALIDATED
            contract.validated_by_id = user.id
            contract.validated_at = datetime.now(timezone.utc)
            contract.thread_id = contract.sr_no
            validated += 1
        else:
            pending += 1
        created += 1

    summary = {
        "dry_run": dry_run,
        "total_rows": len(rows),
        "created": created,
        "validated": validated,
        "pending": pending,
        "row_errors": errors,
        "created_vendors": sorted(created_vendors),
        "created_departments": sorted(created_departments),
    }
    if dry_run:
        db.rollback()
    else:
        log_action(db, "contract", 0, "BULK_IMPORT", user_id=user.id,
                   new_value=f"Imported {created} contract(s) from {file.filename}")
        db.commit()
    return summary


@router.get("/{sr_no}")
def get_contract(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    contract = _get_contract(db, sr_no)
    if _expire_due(db):
        db.commit()
        db.refresh(contract)
    out = contract_out(contract, detail=True)
    out["completeness"] = _completeness(contract)
    return out


@router.get("/{sr_no}/clause-risk")
def contract_clause_risk(sr_no: int, refresh: bool = False, db: Session = Depends(get_db),
                         _: User = Depends(require_viewer)):
    """Clauses in the contract that are not in the company's favour, with reasons,
    plus the document text and the span of each one so the page can highlight
    them inline.

    Spans are resolved here rather than in the browser. The page used to locate
    each flag with an exact substring search, which works for the rule-based
    flags — cut from the text verbatim — and fails for AI-suggested ones, because
    a model re-flows whitespace when it quotes. Those risks were listed under the
    document and never highlighted in it.

    The analysis is cached on the contract. It used to run on every page view,
    so simply opening a contract called the model again — repeatedly, for an
    answer that cannot change unless the document does. The cache is keyed on a
    hash of the text, so a re-extraction invalidates it without anyone having to
    remember; `refresh=true` forces a fresh pass.
    """
    import hashlib

    from ..services.contract_risk import analyze_contract_risk
    from ..services.text_anchor import anchor_all
    contract = _get_contract(db, sr_no)
    text = contract.extracted_text or ""
    fingerprint = hashlib.sha256(text.encode("utf-8")).hexdigest()

    from ..services.json_compat import as_json
    cached = as_json(contract.clause_risk) if contract.clause_risk_hash == fingerprint else None
    if cached is not None and not refresh:
        unlocatable = sum(1 for f in cached if f.get("start") is None)
        return {"text": text, "flagged": cached, "count": len(cached),
                "unlocatable": unlocatable, "cached": True,
                "analyzed_at": contract.clause_risk_at.isoformat() if contract.clause_risk_at else None}

    flagged = analyze_contract_risk(text, db=db)
    flagged, unlocatable = anchor_all(text, flagged)
    contract.clause_risk = flagged
    contract.clause_risk_hash = fingerprint
    contract.clause_risk_at = datetime.now(timezone.utc)
    db.commit()
    return {"text": text, "flagged": flagged, "count": len(flagged),
            "unlocatable": unlocatable, "cached": False,
            "analyzed_at": contract.clause_risk_at.isoformat()}


@router.delete("/{sr_no}")
def delete_contract(sr_no: int, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    """Soft-delete a contract record (super admin only). Recoverable from Data
    Retention until purged."""
    contract = _get_contract(db, sr_no)
    if contract.legal_hold:
        raise HTTPException(423, "Contract is under legal hold and cannot be deleted. Release the hold first.")
    contract.deleted_at = datetime.now(timezone.utc)
    log_action(db, "contract", sr_no, "DELETE", user_id=user.id,
               old_value=contract.vendor_name_raw or (contract.vendor.name if contract.vendor else ""))
    db.commit()
    return {"ok": True, "sr_no": sr_no}


@router.get("/{sr_no}/file")
def get_contract_file(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    contract = _get_contract(db, sr_no)
    if not contract.contract_link or not Path(contract.contract_link).exists():
        raise HTTPException(404, "Document file not found on disk")
    path = Path(contract.contract_link)
    media_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    return FileResponse(
        str(path), media_type=media_types.get(path.suffix.lower(), "application/octet-stream"),
        filename=path.name,
    )


@router.get("/{sr_no}/ocr-layout")
def get_contract_ocr_layout(sr_no: int, db: Session = Depends(get_db),
                            _: User = Depends(require_viewer)):
    """Where each OCR'd word sits on the page, for shading risks on a scan.

    Its own endpoint rather than a field on the contract: this is hundreds of
    kilobytes for a long document and is useless for the common case of a PDF
    that carries its own text layer. The viewer asks for it only after finding
    a page with no text of its own, so digital contracts never fetch it.

    `available: false` rather than a 404 — the viewer asks about every scanned
    document, including ones ingested before layouts were captured, and an
    error status for an expected answer is noise in the console and the logs.
    """
    from ..services.json_compat import as_json
    contract = _get_contract(db, sr_no)
    layout = as_json(contract.ocr_layout)
    if not isinstance(layout, dict) or not layout.get("pages"):
        return {"available": False}
    return {"available": True, **layout}


@router.get("/{sr_no}/attachments")
def list_attachments(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_contract(db, sr_no)
    rows = (
        db.query(ContractAttachment, User)
        .outerjoin(User, ContractAttachment.uploaded_by_id == User.id)
        .filter(ContractAttachment.contract_id == sr_no, ContractAttachment.deleted_at.is_(None))
        .order_by(ContractAttachment.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id": a.id, "filename": a.filename, "kind": a.kind, "size_bytes": a.size_bytes,
            "uploaded_by": u.name if u else None,
            "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else None,
        }
        for a, u in rows
    ]


@router.post("/{sr_no}/attachments")
def add_attachment(
    sr_no: int,
    file: UploadFile = File(...),
    kind: str = "other",
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    from ..services.upload_guard import ATTACHMENT_EXTS, save_upload
    contract = _get_contract_for_write(db, sr_no)
    dest_dir = Path(settings.ATTACHMENTS_DIR) / str(sr_no)
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "document").name
    dest = dest_dir / safe_name
    written = save_upload(file, dest, allowed_exts=ATTACHMENT_EXTS)
    attachment = ContractAttachment(
        contract_id=contract.sr_no, filename=safe_name, path=str(dest.resolve()),
        kind=kind if kind in ("amendment", "annexure", "signed", "other") else "other",
        size_bytes=written, uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.flush()
    log_action(db, "contract", contract.sr_no, "ADD_ATTACHMENT", user_id=user.id,
               new_value=f"{attachment.kind}: {safe_name}")
    db.commit()
    return {"id": attachment.id, "filename": attachment.filename, "kind": attachment.kind}


@router.get("/{sr_no}/attachments/{attachment_id}/file")
def download_attachment(
    sr_no: int, attachment_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)
):
    _get_contract_for_write(db, sr_no)
    attachment = db.get(ContractAttachment, attachment_id)
    if attachment is None or attachment.deleted_at is not None or attachment.contract_id != sr_no:
        raise HTTPException(404, "Attachment not found")
    if not Path(attachment.path).exists():
        raise HTTPException(404, "Attachment file missing on disk")
    return safe_file_response(attachment.path, attachment.filename)


@router.delete("/{sr_no}/attachments/{attachment_id}")
def delete_attachment(
    sr_no: int, attachment_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    _get_contract_for_write(db, sr_no)
    attachment = db.get(ContractAttachment, attachment_id)
    if attachment is None or attachment.deleted_at is not None or attachment.contract_id != sr_no:
        raise HTTPException(404, "Attachment not found")
    attachment.deleted_at = utcnow()  # soft delete
    log_action(db, "contract", sr_no, "REMOVE_ATTACHMENT", user_id=user.id, old_value=attachment.filename)
    db.commit()
    return {"ok": True}


@router.get("/{sr_no}/notes")
def list_notes(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_contract(db, sr_no)
    rows = (
        db.query(ContractNote, User)
        .outerjoin(User, ContractNote.author_id == User.id)
        .filter(ContractNote.contract_id == sr_no, ContractNote.deleted_at.is_(None))
        .order_by(ContractNote.created_at.desc())
        .all()
    )
    return [
        {
            "id": n.id, "body": n.body, "author": u.name if u else None,
            "author_id": n.author_id, "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n, u in rows
    ]


@router.post("/{sr_no}/notes")
def add_note(
    sr_no: int, payload: NoteIn, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    _get_contract_for_write(db, sr_no)
    note = ContractNote(contract_id=sr_no, author_id=user.id, body=payload.body.strip())
    db.add(note)
    db.flush()
    log_action(db, "contract", sr_no, "ADD_NOTE", user_id=user.id)
    db.commit()
    return {"id": note.id, "body": note.body, "author": user.name,
            "author_id": user.id, "created_at": note.created_at.isoformat()}


@router.delete("/{sr_no}/notes/{note_id}")
def delete_note(
    sr_no: int, note_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    _get_contract_for_write(db, sr_no)
    note = db.get(ContractNote, note_id)
    if note is None or note.deleted_at is not None or note.contract_id != sr_no:
        raise HTTPException(404, "Note not found")
    if note.author_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only the author or an administrator can delete this note")
    note.deleted_at = utcnow()  # soft delete
    log_action(db, "contract", sr_no, "DELETE_NOTE", user_id=user.id)
    db.commit()
    return {"ok": True}


def _resolve_assignee(db: Session, user_id: int | None) -> User | None:
    """Validate that user_id is an active validator/admin (or None to unassign)."""
    if user_id is None:
        return None
    u = db.get(User, user_id)
    if u is None or u.deleted_at is not None or not u.is_active:
        raise HTTPException(404, "User not found or inactive")
    if u.role not in (UserRole.ADMIN, UserRole.VALIDATOR):
        raise HTTPException(400, "Only validators or admins can be assignees")
    return u


def _milestone_out(m: ContractMilestone) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "description": m.description,
        "due_date": m.due_date.isoformat() if m.due_date else None,
        "status": m.status.value,
        "completed_at": m.completed_at.isoformat() if m.completed_at else None,
        "overdue": bool(m.status == MilestoneStatus.PENDING and m.due_date and m.due_date < date.today()),
        "obligation_type": m.obligation_type,
        "owner_party": m.owner_party,
        "owner_user_id": m.owner_user_id,
        "owner_user_name": m.owner_user.name if m.owner_user_id and getattr(m, "owner_user", None) else None,
        "frequency": m.frequency,
        "source_text": m.source_text,
        "ai_generated": bool(m.ai_generated),
    }


@router.get("/{sr_no}/milestones")
def list_milestones(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_contract(db, sr_no)
    rows = (
        db.query(ContractMilestone)
        .filter(ContractMilestone.contract_id == sr_no, ContractMilestone.deleted_at.is_(None))
        .order_by(ContractMilestone.due_date.is_(None), ContractMilestone.due_date, ContractMilestone.id)
        .all()
    )
    return [_milestone_out(m) for m in rows]


@router.get("/{sr_no}/deviations")
def contract_deviations(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Playbook deviation report for a register contract (F5)."""
    from ..services.playbook import analyze_contract_deviations
    return analyze_contract_deviations(db, _get_contract(db, sr_no))


@router.post("/{sr_no}/score-risk")
def score_contract_risk(sr_no: int, db: Session = Depends(get_db),
                        user: User = Depends(require_validator)):
    """Score this contract against the playbook and persist the result."""
    from ..services.playbook import score_contract
    c = _get_contract(db, sr_no)
    result = score_contract(db, c)
    log_action(db, "contract", sr_no, "SCORE_RISK", user_id=user.id,
               new_value=str(result.get("risk_score")))
    db.commit()
    return result


@router.post("/score-risk/batch")
def score_risk_batch(limit: int = 500, rescore: bool = False, db: Session = Depends(get_db),
                     user: User = Depends(require_validator)):
    """Score validated contracts that carry no risk score yet (resumable), so an
    existing repository gets a portfolio risk position without a manual pass."""
    from ..services.playbook import score_contract
    q = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None))
    )
    if not rescore:
        q = q.filter(Contract.risk_scored_at.is_(None))
    rows = q.order_by(Contract.sr_no).limit(min(limit, 2000)).all()
    scored = 0
    for c in rows:
        try:
            if score_contract(db, c).get("configured"):
                scored += 1
        except Exception:
            logger.exception("Risk scoring failed for contract %s", c.sr_no)
    remaining = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None),
                Contract.risk_scored_at.is_(None))
        .count()
    )
    log_action(db, "contract", 0, "SCORE_RISK_BATCH", user_id=user.id, new_value=str(scored))
    db.commit()
    return {"scored": scored, "checked": len(rows), "remaining": remaining}


@router.post("/{sr_no}/obligations/extract")
def extract_obligations_endpoint(sr_no: int, db: Session = Depends(get_db),
                                 user: User = Depends(require_validator)):
    """AI-extract this contract's obligations into the milestone register (G4).
    Refreshes prior AI suggestions; manual milestones are preserved."""
    from ..services.obligations import extract_obligations
    c = _get_contract(db, sr_no)
    result = extract_obligations(db, c)
    log_action(db, "contract", sr_no, "EXTRACT_OBLIGATIONS", user_id=user.id,
               new_value=f"{result['created']} obligation(s), ai={result['ai']}")
    db.commit()
    return result


@router.post("/{sr_no}/milestones")
def add_milestone(
    sr_no: int, payload: MilestoneIn, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    _get_contract_for_write(db, sr_no)
    if not payload.title.strip():
        raise HTTPException(400, "Title is required")
    m = ContractMilestone(contract_id=sr_no, title=payload.title.strip(),
                          description=payload.description, due_date=payload.due_date,
                          obligation_type=payload.obligation_type, owner_party=payload.owner_party,
                          owner_user_id=payload.owner_user_id, frequency=payload.frequency)
    db.add(m)
    db.flush()
    log_action(db, "contract", sr_no, "ADD_MILESTONE", user_id=user.id, new_value=m.title)
    db.commit()
    return _milestone_out(m)


@router.patch("/{sr_no}/milestones/{milestone_id}")
def update_milestone(
    sr_no: int, milestone_id: int, payload: MilestoneUpdate,
    db: Session = Depends(get_db), user: User = Depends(require_validator),
):
    _get_contract_for_write(db, sr_no)
    m = db.get(ContractMilestone, milestone_id)
    if m is None or m.deleted_at is not None or m.contract_id != sr_no:
        raise HTTPException(404, "Milestone not found")
    if payload.title is not None:
        m.title = payload.title.strip()
    if payload.description is not None:
        m.description = payload.description
    if payload.due_date is not None:
        m.due_date = payload.due_date
    if payload.obligation_type is not None:
        m.obligation_type = payload.obligation_type or None
    if payload.owner_party is not None:
        m.owner_party = payload.owner_party or None
    if payload.owner_user_id is not None:
        m.owner_user_id = payload.owner_user_id or None
    if payload.frequency is not None:
        m.frequency = payload.frequency or None
    if payload.status is not None:
        try:
            new_status = MilestoneStatus(payload.status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {payload.status}")
        if new_status != m.status:
            m.status = new_status
            if new_status == MilestoneStatus.DONE:
                m.completed_at = utcnow()
                m.completed_by_id = user.id
            else:
                m.completed_at = None
                m.completed_by_id = None
            log_action(db, "contract", sr_no, "MILESTONE_STATUS", user_id=user.id,
                       field=m.title, new_value=new_status.value)
    db.commit()
    return _milestone_out(m)


@router.delete("/{sr_no}/milestones/{milestone_id}")
def delete_milestone(
    sr_no: int, milestone_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    _get_contract_for_write(db, sr_no)
    m = db.get(ContractMilestone, milestone_id)
    if m is None or m.deleted_at is not None or m.contract_id != sr_no:
        raise HTTPException(404, "Milestone not found")
    m.deleted_at = utcnow()
    log_action(db, "contract", sr_no, "DELETE_MILESTONE", user_id=user.id, old_value=m.title)
    db.commit()
    return {"ok": True}


@router.put("/{sr_no}/assignee")
def set_contract_assignee(
    sr_no: int, payload: AssigneeUpdate, db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    """Assign (or unassign, with user_id=null) a validator/admin as the contract owner."""
    contract = _get_contract_for_write(db, sr_no)
    assignee = _resolve_assignee(db, payload.user_id)
    if contract.assignee_id != (assignee.id if assignee else None):
        old = contract.assignee.name if contract.assignee else None
        contract.assignee_id = assignee.id if assignee else None
        log_action(db, "contract", sr_no, "SET_ASSIGNEE", user_id=user.id,
                   field="assignee", old_value=old, new_value=assignee.name if assignee else None)
        if assignee and assignee.id != user.id:
            from ..services.user_notifications import create_notification
            create_notification(db, assignee.id, "assignment",
                                f"You were assigned contract #{sr_no}", f"/contracts/{sr_no}")
        db.commit()
    return {"assignee_id": contract.assignee_id,
            "assignee_name": assignee.name if assignee else None}


@router.put("/{sr_no}/tags")
def set_contract_tags(
    sr_no: int, payload: TagAssign, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Replace a contract's tags with the given set of tag ids."""
    contract = _get_contract_for_write(db, sr_no)
    ids = list(dict.fromkeys(payload.tag_ids))  # de-dupe, keep order
    tags = db.query(Tag).filter(Tag.id.in_(ids), Tag.deleted_at.is_(None)).all() if ids else []
    found = {t.id for t in tags}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(404, f"Unknown tag id(s): {', '.join(map(str, missing))}")
    before = sorted(t.name for t in contract.tags if t.deleted_at is None)
    contract.tags = tags
    after = sorted(t.name for t in tags)
    if before != after:
        log_action(db, "contract", sr_no, "SET_TAGS", user_id=user.id,
                   old_value=", ".join(before) or None, new_value=", ".join(after) or None)
    db.commit()
    return {"tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags]}


@router.get("/{sr_no}/audit")
def contract_audit(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    _get_contract(db, sr_no)
    rows = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(AuditLog.entity_type == "contract", AuditLog.entity_id == sr_no)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "action": a.action,
            "field": a.field,
            "old_value": a.old_value,
            "new_value": a.new_value,
            "user": u.name if u else None,
            "created_at": a.created_at.isoformat(),
        }
        for a, u in rows
    ]


@router.put("/{sr_no}")
def update_contract(
    sr_no: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract(db, sr_no)
    if contract.legal_hold:
        raise HTTPException(423, "Contract is under legal hold and cannot be edited. Release the hold first.")
    _apply_update(db, contract, payload, user)
    db.commit()
    out = contract_out(contract, detail=True)
    out["completeness"] = _completeness(contract)
    return out


class LegalHoldRequest(__import__("pydantic").BaseModel):
    reason: str | None = None


def _can_legal_hold(user: User) -> bool:
    from ..auth import user_roles
    return bool({UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.LEGAL} & user_roles(user))


@router.post("/{sr_no}/legal-hold")
def place_legal_hold(sr_no: int, payload: LegalHoldRequest, db: Session = Depends(get_db),
                     user: User = Depends(require_validator)):
    """Place a legal hold (Legal/Admin): locks the record from edit and exempts
    it from deletion/purge until released."""
    if not _can_legal_hold(user):
        raise HTTPException(403, "Only Legal or an admin can place a legal hold")
    contract = _get_contract(db, sr_no)
    contract.legal_hold = True
    contract.legal_hold_reason = (payload.reason or "").strip() or None
    contract.legal_hold_by_id = user.id
    contract.legal_hold_at = datetime.now(timezone.utc)
    log_action(db, "contract", sr_no, "LEGAL_HOLD", user_id=user.id, new_value=contract.legal_hold_reason or "")
    db.commit()
    return contract_out(contract, detail=True)


@router.delete("/{sr_no}/legal-hold")
def release_legal_hold(sr_no: int, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    """Release a legal hold (Legal/Admin)."""
    if not _can_legal_hold(user):
        raise HTTPException(403, "Only Legal or an admin can release a legal hold")
    contract = _get_contract(db, sr_no)
    contract.legal_hold = False
    contract.legal_hold_reason = None
    contract.legal_hold_by_id = None
    contract.legal_hold_at = None
    log_action(db, "contract", sr_no, "LEGAL_HOLD_RELEASE", user_id=user.id)
    db.commit()
    return contract_out(contract, detail=True)


@router.get("/{sr_no}/field-suggestions")
def field_suggestions(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Suggested field values for the validation screen, from two sources.

    History knows what this vendor usually agrees; the document knows what *this*
    contract says. History alone left the validator to find the PO number, term
    dates and payment terms by reading the paper — so document-derived
    suggestions are offered alongside, each carrying the sentence it came from,
    and the validator checks a quote rather than trusting a value.

    Where the two disagree both are shown. Which is right is a judgement for the
    person validating, and hiding one of them would be making it for them.
    """
    from ..models import InternalEntity
    from ..services.document_suggestions import suggest_from_document
    from ..services.field_learning import suggest_for_contract, vendor_history

    contract = _get_contract(db, sr_no)
    history = vendor_history(db, contract.vendor_id, exclude_sr=contract.sr_no)
    suggestions = suggest_for_contract(db, contract)

    # Resolve department ids to names for display on the suggested value.
    dept_ids = [
        s["suggested"] for s in suggestions.values()
        if s["field"] == "department_id" and s["suggested"] is not None
    ]
    dept_names = {
        d.id: d.name
        for d in (db.query(Department).filter(Department.id.in_(dept_ids)).all() if dept_ids else [])
    }
    items = []
    for s in suggestions.values():
        item = dict(s)
        if s["field"] == "department_id":
            item["suggested_label"] = dept_names.get(s["suggested"])
        items.append(item)
    # Blanks first, then most confident.
    items.sort(key=lambda s: (not s["current_empty"], -s["confidence"], -s["support"]))
    for item in items:
        item.setdefault("source", "history")

    entities = [e.name for e in db.query(InternalEntity)
                .filter(InternalEntity.deleted_at.is_(None)).all()]
    from_doc = []
    for s in suggest_from_document(contract.extracted_text or "", signing_entities=entities):
        current = getattr(contract, s["field"], None)
        s["current"] = current.isoformat() if hasattr(current, "isoformat") else current
        s["current_empty"] = current in (None, "")
        # Nothing to suggest when the record already says the same thing.
        if not s["current_empty"] and str(current) == str(s["suggested"]):
            continue
        from_doc.append(s)
    from_doc.sort(key=lambda s: not s["current_empty"])

    return {
        "vendor_id": contract.vendor_id,
        "vendor_name": (contract.vendor.name if contract.vendor else contract.vendor_name_raw),
        "history_count": len(history),
        "suggestions": items,
        "document_suggestions": from_doc,
    }


@router.get("/{sr_no}/suggest-department")
def suggest_department_endpoint(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """AI department suggestion from validated history (this vendor first, then
    the most similar validated contracts). Returns the department + rationale."""
    from ..services.field_learning import suggest_department

    contract = _get_contract(db, sr_no)
    result = suggest_department(db, contract)
    if not result or not result.get("department_id"):
        return {"department_id": None}
    dept = db.get(Department, result["department_id"])
    if dept is None or dept.deleted_at is not None:
        return {"department_id": None}
    result["department_name"] = dept.name
    return result


# How many older contracts get a sketch computed per validation. Bounded so one
# validation never pays for the whole repository.
_SKETCH_BACKFILL_BATCH = 200


def _content_sketch(db: Session, contract: Contract) -> list[int]:
    """The contract's document sketch, computed and stored on first need."""
    from ..services.document_dupes import sketch, text_fingerprint
    text = contract.extracted_text or ""
    fingerprint = text_fingerprint(text)
    if contract.content_sketch is None or contract.content_sketch_hash != fingerprint:
        contract.content_sketch = sketch(text)
        contract.content_sketch_hash = fingerprint
        db.flush()
    return contract.content_sketch or []


def _content_duplicate_hits(db: Session, contract: Contract) -> dict[int, float]:
    """Validated contracts whose *document* is the same paper as this one.

    The record-level check compares what was captured, so it finds nothing when
    the same document is ingested twice before anyone has typed anything, or
    when a field was mis-keyed. This compares the text instead.
    """
    from ..services.document_dupes import find_content_duplicates, sketch, text_fingerprint
    mine = _content_sketch(db, contract)
    if not mine:
        return {}

    # Contracts validated before this existed have no sketch, so there would be
    # nothing to compare against and the check would quietly do nothing on an
    # existing repository. Fill them in a batch at a time, oldest first, so the
    # backfill completes over a few validations without any one of them paying
    # for the whole repository.
    pending = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED,
                Contract.deleted_at.is_(None),
                Contract.content_sketch.is_(None),
                Contract.extracted_text.isnot(None))
        .order_by(Contract.sr_no)
        .limit(_SKETCH_BACKFILL_BATCH)
        .all()
    )
    for row in pending:
        row.content_sketch = sketch(row.extracted_text or "")
        row.content_sketch_hash = text_fingerprint(row.extracted_text or "")
    if pending:
        db.flush()

    others = (
        db.query(Contract.sr_no, Contract.content_sketch)
        .filter(Contract.status == ContractStatus.VALIDATED,
                Contract.deleted_at.is_(None),
                Contract.sr_no != contract.sr_no,
                Contract.content_sketch.isnot(None))
        .all()
    )
    return dict(find_content_duplicates(mine, [(sr, sk) for sr, sk in others]))


def _run_duplicate_detection(db: Session, contract: Contract) -> list[dict]:
    existing = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.deleted_at.is_(None))
        .all()
    )
    hits = find_duplicates(_facts(contract), [_facts(e) for e in existing])
    by_record = {facts.sr_no for facts, _, _ in hits}
    for sr_no, score in _content_duplicate_hits(db, contract).items():
        if sr_no not in by_record:
            match = next((e for e in existing if e.sr_no == sr_no), None)
            if match is not None:
                hits.append((_facts(match),
                             f"Near-identical document ({score * 100:.0f}% of the text matches)",
                             round(score * 100, 1)))
    results = []
    for facts, reason, score in hits:
        candidate = (
            db.query(DuplicateCandidate)
            .filter_by(contract_id=contract.sr_no, matched_contract_id=facts.sr_no)
            .first()
        )
        if candidate is None:
            candidate = DuplicateCandidate(
                contract_id=contract.sr_no,
                matched_contract_id=facts.sr_no,
                reason=reason,
                score=score,
            )
            db.add(candidate)
            db.flush()
        matched = db.get(Contract, facts.sr_no)
        results.append({
            "candidate_id": candidate.id,
            "matched_contract": contract_out(matched),
            "reason": reason,
            "score": score,
        })
    return results


@router.post("/{sr_no}/validate")
def validate_contract(
    sr_no: int,
    payload: ValidateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract(db, sr_no)
    if contract.status not in (ContractStatus.PENDING_VALIDATION, ContractStatus.VALIDATED):
        raise HTTPException(400, f"Contract is {contract.status.value}; cannot validate")

    _apply_update(db, contract, payload, user)

    missing = _missing_mandatory(contract)
    if missing:
        db.commit()  # keep the edits even when validation is blocked
        raise HTTPException(422, f"Mandatory fields missing: {', '.join(missing)}")

    canonical, entity_ok = resolve_signing_entity(db, contract.signing_entity)
    if not entity_ok:
        db.commit()  # keep the edits even when validation is blocked
        raise HTTPException(
            422,
            f"Signing entity '{contract.signing_entity}' is not a recognized internal "
            "entity. Pick a predefined entity (or add it under Admin Settings → "
            "Internal entities) before validating.",
        )
    if canonical and canonical != contract.signing_entity:
        contract.signing_entity = canonical  # snap to the master's canonical name

    duplicates = _run_duplicate_detection(db, contract)
    if duplicates and not payload.force:
        db.commit()
        return {"status": "DUPLICATES_FOUND", "duplicates": duplicates,
                "contract": contract_out(contract, detail=True)}

    contract.status = ContractStatus.VALIDATED
    contract.validated_by_id = user.id
    contract.validated_at = datetime.now(timezone.utc)
    if contract.thread_id is None:
        contract.thread_id = contract.sr_no
    log_action(db, "contract", contract.sr_no, "VALIDATE", user_id=user.id)

    if contract.ingestion_file_id:
        ingestion = db.get(IngestionFile, contract.ingestion_file_id)
        if ingestion:
            ingestion.status = IngestionStatus.VALIDATED
    _autolearn_clauses(db, contract)
    # Repository AI (G6): abstract + embedding for search, best-effort so a slow
    # or unconfigured model never blocks validation.
    try:
        from ..services.contract_ai import index_contract
        index_contract(db, contract)
    except Exception:
        logger.exception("AI indexing failed for contract %s", contract.sr_no)
    # Obligation register (F4): extract on validation so the extract → track →
    # chase loop starts without anyone having to click. Best-effort, like indexing.
    try:
        from ..services.obligations import extract_obligations
        extract_obligations(db, contract)
    except Exception:
        logger.exception("Obligation extraction failed for contract %s", contract.sr_no)
    # Playbook risk position (F5), persisted for filtering/reporting/trending.
    try:
        from ..services.playbook import score_contract
        score_contract(db, contract)
    except Exception:
        logger.exception("Risk scoring failed for contract %s", contract.sr_no)
    # Structured clause values (J1) so the contract is filterable on its terms.
    try:
        from ..services.clause_attributes import extract_attributes
        contract.clause_attributes = extract_attributes(contract.extracted_text or "")
    except Exception:
        logger.exception("Attribute extraction failed for contract %s", contract.sr_no)
    db.commit()
    from ..services.event_webhooks import emit_event
    emit_event(db, "contract.validated", contract)
    return {"status": "VALIDATED", "contract": contract_out(contract, detail=True),
            "duplicates": duplicates}


@router.post("/{sr_no}/reject")
def reject_contract(
    sr_no: int,
    payload: RejectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract(db, sr_no)
    contract.status = ContractStatus.REJECTED
    contract.rejection_reason = payload.reason
    log_action(db, "contract", contract.sr_no, "REJECT", user_id=user.id, new_value=payload.reason)
    db.commit()
    from ..services.event_webhooks import emit_event
    emit_event(db, "contract.rejected", contract)
    return contract_out(contract, detail=True)


@router.post("/{sr_no}/renew")
def renew_contract(sr_no: int, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    """Create a renewal draft pre-filled from an expiring contract, linked into
    the same contract thread. The renewal enters the validation queue; the
    source stays active until you mark it Renewed."""
    from datetime import timedelta

    source = _get_contract(db, sr_no)
    if source.status != ContractStatus.VALIDATED:
        raise HTTPException(400, "Only a validated contract can be renewed")

    new_start = (source.end_date + timedelta(days=1)) if source.end_date else None
    renewal = Contract(
        signing_entity=source.signing_entity,
        vendor_id=source.vendor_id,
        vendor_name_raw=source.vendor_name_raw,
        vendor_address=source.vendor_address,
        department_id=source.department_id,
        contract_service=source.contract_service,
        service_summary=source.service_summary,
        iks_signing_authority=source.iks_signing_authority,
        vendor_signing_authority=source.vendor_signing_authority,
        currency=source.currency,
        contract_value=source.contract_value,
        contract_tenure=source.contract_tenure,
        start_date=new_start,
        po_number=None,  # a renewal typically gets a new PO
        reminder_rule_id=source.reminder_rule_id,
        custom_offsets=source.custom_offsets,
        status=ContractStatus.PENDING_VALIDATION,
        raw_extracted={}, confidence={}, derived_fields=[],
        extraction_model="renewal",
        renews_contract_id=source.sr_no,
        thread_id=source.thread_id or source.sr_no,
    )
    # Carry the tenure forward into a derived end date
    start, end, derived = derive_dates(renewal.start_date, None, renewal.contract_tenure)
    renewal.start_date, renewal.end_date, renewal.derived_fields = start, end, derived
    db.add(renewal)
    db.flush()

    # Copy reminder recipients from the source
    for r in source.recipients:
        if r.deleted_at is None:
            db.add(ContractRecipient(
                contract_id=renewal.sr_no, name=r.name, email=r.email,
                is_primary=r.is_primary, user_id=r.user_id,
            ))

    log_action(db, "contract", renewal.sr_no, "RENEW_FROM", user_id=user.id,
               new_value=f"Renewal draft of contract #{source.sr_no}")
    log_action(db, "contract", source.sr_no, "RENEWAL_CREATED", user_id=user.id,
               new_value=f"Renewal draft #{renewal.sr_no} created")
    db.commit()
    out = contract_out(renewal, detail=True)
    out["completeness"] = _completeness(renewal)
    return out


@router.post("/{sr_no}/restore")
def restore_contract(
    sr_no: int, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Bring a rejected or archived contract back into the validation queue."""
    contract = _get_contract(db, sr_no)
    if contract.status not in (ContractStatus.REJECTED, ContractStatus.ARCHIVED):
        raise HTTPException(400, "Only rejected or archived contracts can be restored")
    log_action(
        db, "contract", contract.sr_no, "RESTORE", user_id=user.id,
        field="status", old_value=contract.status.value,
        new_value=ContractStatus.PENDING_VALIDATION.value,
    )
    contract.status = ContractStatus.PENDING_VALIDATION
    contract.rejection_reason = None
    db.commit()
    return contract_out(contract, detail=True)


@router.post("/{sr_no}/lifecycle")
def set_lifecycle(
    sr_no: int,
    payload: LifecycleRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract_for_write(db, sr_no)
    try:
        new_status = LifecycleStatus(payload.status)
    except ValueError:
        raise HTTPException(400, f"Invalid lifecycle status: {payload.status}")
    log_action(
        db, "contract", contract.sr_no, "LIFECYCLE", user_id=user.id,
        field="lifecycle_status", old_value=contract.lifecycle_status.value,
        new_value=new_status.value,
    )
    contract.lifecycle_status = new_status
    db.commit()
    if new_status in (LifecycleStatus.RENEWED, LifecycleStatus.TERMINATED):
        from ..services.event_webhooks import emit_event
        emit_event(db, f"contract.{new_status.value.lower()}", contract)
    return contract_out(contract, detail=True)


@router.post("/{sr_no}/acknowledge-reminders")
def acknowledge_reminders(
    sr_no: int, acknowledged: bool = True,
    db: Session = Depends(get_db), user: User = Depends(require_validator),
):
    """Stop (or resume) expiry reminders for a contract someone has dealt with.

    `acknowledged=false` resumes them. Without that this was a one-way door:
    nothing anywhere cleared the flag, so a mis-click silenced a contract's
    expiry reminders permanently — on the one record type where a missed expiry
    is the failure the system exists to prevent.
    """
    contract = _get_contract(db, sr_no)
    was = contract.reminders_acknowledged
    contract.reminders_acknowledged = acknowledged
    log_action(db, "contract", contract.sr_no,
               "ACK_REMINDERS" if acknowledged else "RESUME_REMINDERS",
               user_id=user.id, field="reminders_acknowledged",
               old_value=str(was), new_value=str(acknowledged))
    db.commit()
    return contract_out(contract, detail=True)


@router.post("/{sr_no}/snooze-reminders")
def snooze_reminders(
    sr_no: int, payload: SnoozeRequest, db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    """Pause reminders until a future date (from `days` or `until`); both null clears it."""
    contract = _get_contract(db, sr_no)
    if payload.until is not None:
        target = payload.until
    elif payload.days is not None and payload.days > 0:
        target = date.today() + timedelta(days=payload.days)
    else:
        target = None
    if target is not None and target <= date.today():
        raise HTTPException(400, "Snooze date must be in the future")
    old = contract.reminders_snoozed_until
    contract.reminders_snoozed_until = target
    log_action(db, "contract", sr_no, "SNOOZE_REMINDERS", user_id=user.id, field="reminders_snoozed_until",
               old_value=old.isoformat() if old else None, new_value=target.isoformat() if target else None)
    db.commit()
    return contract_out(contract, detail=True)


@router.put("/{sr_no}/recipients")
def set_recipients(
    sr_no: int,
    payload: RecipientsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract_for_write(db, sr_no)
    primaries = [r for r in payload.recipients if r.is_primary]
    if payload.recipients and len(primaries) != 1:
        raise HTTPException(400, "Exactly one primary recipient is required")
    old = [f"{r.name} <{r.email}>" for r in contract.recipients if r.deleted_at is None]
    for r in contract.recipients:
        if r.deleted_at is None:
            r.deleted_at = datetime.now(timezone.utc)
    for r in payload.recipients:
        db.add(ContractRecipient(
            contract_id=contract.sr_no, name=r.name, email=r.email,
            is_primary=r.is_primary, user_id=r.user_id,
        ))
    log_action(
        db, "contract", contract.sr_no, "RECIPIENTS", user_id=user.id,
        field="recipients", old_value=", ".join(old),
        new_value=", ".join(f"{r.name} <{r.email}>" for r in payload.recipients),
    )
    db.commit()
    db.refresh(contract)
    return contract_out(contract, detail=True)


_THREAD_FIELDS = [
    ("vendor", lambda c: (c.vendor.name if c.vendor else None) or c.vendor_name_raw),
    ("signing_entity", lambda c: c.signing_entity),
    ("contract_type", lambda c: c.contract_type),
    ("department", lambda c: c.department.name if c.department else None),
    ("start_date", lambda c: c.start_date.isoformat() if c.start_date else None),
    ("end_date", lambda c: c.end_date.isoformat() if c.end_date else None),
    ("contract_tenure", lambda c: c.contract_tenure),
    ("po_number", lambda c: c.po_number),
    ("contract_value", lambda c: float(c.contract_value) if c.contract_value is not None else None),
    ("currency", lambda c: c.currency),
    ("contract_service", lambda c: c.contract_service),
]


@router.get("/{sr_no}/thread")
def contract_thread(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Return every contract in this contract's renewal thread, in chronological
    order, with the fields that changed from the previous version flagged — a
    side-by-side diff across renewals/amendments."""
    contract = _get_contract(db, sr_no)
    tid = contract.thread_id or contract.sr_no
    members = (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None))
        .filter((Contract.thread_id == tid) | (Contract.sr_no == tid))
        .all()
    )
    if contract.sr_no not in {m.sr_no for m in members}:
        members.append(contract)
    members.sort(key=lambda c: (c.start_date or date.min, c.sr_no))

    versions = []
    prev_values = None
    for c in members:
        values = {name: getter(c) for name, getter in _THREAD_FIELDS}
        changed = (
            [name for name in values if prev_values is not None and values[name] != prev_values[name]]
        )
        versions.append({
            "sr_no": c.sr_no,
            "status": c.status.value,
            "lifecycle_status": c.lifecycle_status.value,
            "is_current": c.sr_no == contract.sr_no,
            "values": values,
            "changed": changed,
        })
        prev_values = values

    return {
        "thread_id": tid,
        "fields": [name for name, _ in _THREAD_FIELDS],
        "versions": versions,
    }


def _group_members(db: Session, contract: Contract) -> list[Contract]:
    """All documents in this contract's group (or just itself when ungrouped)."""
    if contract.group_id is None:
        return [contract]
    return (
        db.query(Contract)
        .filter(Contract.group_id == contract.group_id, Contract.deleted_at.is_(None))
        .all()
    )


def _group_member_out(c: Contract, current_sr: int) -> dict:
    return {
        "sr_no": c.sr_no,
        "contract_type": c.contract_type,
        "vendor_name": c.vendor.name if c.vendor else c.vendor_name_raw,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "status": c.status.value,
        "lifecycle_status": c.lifecycle_status.value,
        "thread_id": c.thread_id,
        "renews_contract_id": c.renews_contract_id,
        "has_document": bool(c.contract_link),
        "is_current": c.sr_no == current_sr,
    }


@router.get("/{sr_no}/group")
def contract_group(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """The documents that make up this logical contract (NDA/BAA/MSA/SOW…) plus a
    combined renewal history: every contract in any group member's renewal
    thread, in chronological order."""
    from sqlalchemy import or_

    contract = _get_contract(db, sr_no)
    members = _group_members(db, contract)

    tids = {m.thread_id or m.sr_no for m in members}
    history = (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None))
        .filter(or_(Contract.thread_id.in_(tids), Contract.sr_no.in_(tids)))
        .all()
    )
    history.sort(key=lambda c: (c.start_date or date.min, c.sr_no))

    return {
        "group_id": contract.group_id,
        "members": [
            _group_member_out(m, contract.sr_no)
            for m in sorted(members, key=lambda c: ((c.contract_type or "~"), c.sr_no))
        ],
        "renewal_history": [_group_member_out(c, contract.sr_no) for c in history],
    }


@router.post("/{sr_no}/link-document")
def link_document(
    sr_no: int, payload: LinkDocument,
    db: Session = Depends(get_db), user: User = Depends(require_validator),
):
    """Link another contract into this contract's group so they're treated as
    documents of the same logical contract."""
    a = _get_contract_for_write(db, sr_no)
    b = _get_contract(db, payload.sr_no)
    if a.sr_no == b.sr_no:
        raise HTTPException(400, "A contract cannot be linked to itself")

    if a.group_id and b.group_id and a.group_id != b.group_id:
        old = b.group_id  # merge b's group into a's
        db.query(Contract).filter(Contract.group_id == old).update(
            {Contract.group_id: a.group_id}, synchronize_session=False
        )
    elif a.group_id:
        b.group_id = a.group_id
    elif b.group_id:
        a.group_id = b.group_id
    else:
        gid = min(a.sr_no, b.sr_no)
        a.group_id = b.group_id = gid

    log_action(db, "contract", a.sr_no, "LINK_DOCUMENT", user_id=user.id,
               new_value=f"Linked #{b.sr_no} into the contract group")
    db.commit()
    db.refresh(a)
    return contract_group(a.sr_no, db, user)


@router.post("/{sr_no}/unlink-document")
def unlink_document(
    sr_no: int, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Remove this contract from its group (the other members stay linked)."""
    contract = _get_contract_for_write(db, sr_no)
    contract.group_id = None
    log_action(db, "contract", contract.sr_no, "UNLINK_DOCUMENT", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.get("/{sr_no}/reminder-schedule")
def reminder_schedule(sr_no: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Preview the dates reminders will actually fire for this contract."""
    from ..services.reminders import resolve_rule, upcoming_reminder_dates

    contract = _get_contract(db, sr_no)
    rule = resolve_rule(db, contract)
    offsets = contract.custom_offsets or (rule.offsets if rule else None)
    stopped = contract.lifecycle_status.value in ("RENEWED", "TERMINATED") or contract.reminders_acknowledged
    snoozed_until = contract.reminders_snoozed_until
    snoozed = bool(snoozed_until and snoozed_until > date.today())
    dates = []
    if offsets and contract.end_date and not stopped:
        # If snoozed, only show dates from the resume date forward
        from_date = snoozed_until if snoozed else None
        dates = upcoming_reminder_dates(
            contract.end_date, offsets,
            rule.periodicity_days if rule else None,
            rule.post_expiry_days if rule else None,
            from_date=from_date,
        )
    return {
        "rule": rule.name if rule else None,
        "offsets": offsets or [],
        "end_date": contract.end_date.isoformat() if contract.end_date else None,
        "stopped": stopped,
        "stopped_reason": (
            contract.lifecycle_status.value if contract.lifecycle_status.value in ("RENEWED", "TERMINATED")
            else ("acknowledged" if contract.reminders_acknowledged else None)
        ),
        "snoozed_until": snoozed_until.isoformat() if snoozed else None,
        "dates": [d.isoformat() for d in dates],
    }


@router.put("/{sr_no}/reminder-override")
def set_reminder_override(
    sr_no: int,
    payload: ReminderOverride,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    contract = _get_contract_for_write(db, sr_no)
    log_field_changes(
        db, "contract", contract.sr_no,
        {
            "reminder_rule_id": contract.reminder_rule_id,
            "custom_offsets": contract.custom_offsets,
            "escalation_after": contract.escalation_after,
            "escalation_email": contract.escalation_email,
        },
        {
            "reminder_rule_id": payload.reminder_rule_id,
            "custom_offsets": payload.custom_offsets,
            "escalation_after": payload.escalation_after,
            "escalation_email": payload.escalation_email,
        },
        user.id, action="REMINDER_OVERRIDE",
    )
    contract.reminder_rule_id = payload.reminder_rule_id
    contract.custom_offsets = payload.custom_offsets
    contract.escalation_after = payload.escalation_after
    contract.escalation_email = payload.escalation_email
    db.commit()
    return contract_out(contract, detail=True)
