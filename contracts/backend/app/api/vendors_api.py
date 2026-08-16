import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
import uuid

from ..models import AuditLog, Contract, User, Vendor, VendorAlias, VendorMergeLog, utcnow
from ..schemas import VendorIn, VendorMerge
from ..serializers import contract_out, vendor_out
from ..services.dates import days_to_expiry
from ..services.excel_export import contracts_to_register_xlsx
from ..services.vendor_matching import normalize_vendor_name, vendor_similarity

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("")
def list_vendors(
    q: str | None = None,
    sort: str = "name",
    order: str = "asc",
    limit: int = 100,
    offset: int = 0,
    paginate: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    """List vendors with per-vendor contract counts.

    Aliases are eager-loaded (``selectinload``) so serializing N rows costs one
    extra query instead of N. By default the response is a flat list (kept for
    the autocomplete/dashboard callers). Pass ``paginate=true`` to get a
    ``{items, total, limit, offset}`` envelope with server-side sort + offset,
    which is what the Vendor Master page uses so it never loads every vendor.
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    counts = dict(
        db.query(Contract.vendor_id, func.count(Contract.sr_no))
        .filter(Contract.deleted_at.is_(None))
        .group_by(Contract.vendor_id)
        .all()
    )

    if q:
        # Fuzzy autocomplete scores every vendor, so we must load them all —
        # but eager-load aliases to avoid an N+1 over the alias table.
        vendors = (
            db.query(Vendor)
            .filter(Vendor.deleted_at.is_(None))
            .options(selectinload(Vendor.aliases))
            .all()
        )
        scored = []
        for v in vendors:
            names = [v.name] + [a.alias for a in v.aliases]
            score = max(vendor_similarity(q, n) for n in names)
            if score >= 60 or q.lower() in v.name.lower():
                scored.append((score, v))
        scored.sort(key=lambda t: -t[0])
        matched = [v for _, v in scored]
        if paginate:
            page = matched[offset:offset + limit]
            return {
                "items": [vendor_out(v, counts.get(v.id, 0)) for v in page],
                "total": len(matched), "limit": limit, "offset": offset,
            }
        return [vendor_out(v, counts.get(v.id, 0)) for v in matched[:limit]]

    base = db.query(Vendor).filter(Vendor.deleted_at.is_(None))
    descending = order == "desc"
    if sort == "contracts":
        # Order by contract count via a grouped subquery so paging is correct
        # at the DB level rather than sorting a single loaded page.
        cnt = (
            db.query(Contract.vendor_id, func.count(Contract.sr_no).label("n"))
            .filter(Contract.deleted_at.is_(None))
            .group_by(Contract.vendor_id)
            .subquery()
        )
        n = func.coalesce(cnt.c.n, 0)
        base = base.outerjoin(cnt, Vendor.id == cnt.c.vendor_id).order_by(
            n.desc() if descending else n.asc(), func.lower(Vendor.name).asc()
        )
    else:
        name = func.lower(Vendor.name)
        base = base.order_by(name.desc() if descending else name.asc())

    if paginate:
        total = (
            db.query(func.count(Vendor.id)).filter(Vendor.deleted_at.is_(None)).scalar()
        )
        vendors = (
            base.options(selectinload(Vendor.aliases)).offset(offset).limit(limit).all()
        )
        return {
            "items": [vendor_out(v, counts.get(v.id, 0)) for v in vendors],
            "total": total, "limit": limit, "offset": offset,
        }
    vendors = base.options(selectinload(Vendor.aliases)).limit(limit).all()
    return [vendor_out(v, counts.get(v.id, 0)) for v in vendors]


@router.post("")
def create_vendor(payload: VendorIn, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    vendor = Vendor(
        name=payload.name,
        normalized_name=normalize_vendor_name(payload.name),
        addresses=payload.addresses,
        contacts=payload.contacts,
    )
    db.add(vendor)
    db.flush()
    for alias in payload.aliases:
        db.add(VendorAlias(vendor_id=vendor.id, alias=alias, normalized_alias=normalize_vendor_name(alias)))
    log_action(db, "vendor", vendor.id, "CREATE", user_id=user.id, new_value=payload.name)
    db.commit()
    db.refresh(vendor)
    return vendor_out(vendor)


@router.put("/{vendor_id}")
def update_vendor(
    vendor_id: int, payload: VendorIn, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None or vendor.deleted_at is not None:
        raise HTTPException(404, "Vendor not found")
    log_action(db, "vendor", vendor.id, "UPDATE", user_id=user.id,
               old_value=vendor.name, new_value=payload.name)
    vendor.name = payload.name
    vendor.normalized_name = normalize_vendor_name(payload.name)
    vendor.addresses = payload.addresses
    vendor.contacts = payload.contacts
    for a in list(vendor.aliases):
        db.delete(a)
    for alias in payload.aliases:
        db.add(VendorAlias(vendor_id=vendor.id, alias=alias, normalized_alias=normalize_vendor_name(alias)))
    db.commit()
    db.refresh(vendor)
    return vendor_out(vendor)


@router.post("/{target_id}/merge")
def merge_vendors(
    target_id: int, payload: VendorMerge, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Fold one or more source vendors into the target: re-point their contracts,
    absorb their names/aliases/addresses/contacts, then soft-delete the sources."""
    target = db.get(Vendor, target_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(404, "Target vendor not found")

    batch_id = uuid.uuid4().hex
    moved = 0
    absorbed: list[str] = []
    existing_aliases = {a.normalized_alias for a in target.aliases} | {target.normalized_name}
    for source_id in payload.source_ids:
        if source_id == target_id:
            continue
        source = db.get(Vendor, source_id)
        if source is None or source.deleted_at is not None:
            continue

        moved_ids: list[int] = []
        for contract in db.query(Contract).filter(Contract.vendor_id == source_id).all():
            contract.vendor_id = target_id
            moved_ids.append(contract.sr_no)
            moved += 1

        # The source name and its aliases become aliases of the survivor
        added_alias_ids: list[int] = []
        for alias_name in [source.name] + [a.alias for a in source.aliases]:
            na = normalize_vendor_name(alias_name)
            if na and na not in existing_aliases:
                alias = VendorAlias(vendor_id=target_id, alias=alias_name, normalized_alias=na)
                db.add(alias)
                db.flush()
                added_alias_ids.append(alias.id)
                existing_aliases.add(na)

        current_addrs = target.addresses or []
        added_addresses = [a for a in (source.addresses or []) if a not in current_addrs]
        target.addresses = current_addrs + added_addresses
        current_contacts = target.contacts or []
        added_contacts = [c for c in (source.contacts or []) if c not in current_contacts]
        target.contacts = current_contacts + added_contacts

        source.deleted_at = utcnow()
        absorbed.append(source.name)
        db.add(VendorMergeLog(
            batch_id=batch_id, target_id=target_id, source_id=source.id,
            moved_contract_ids=moved_ids, added_alias_ids=added_alias_ids,
            added_addresses=added_addresses, added_contacts=added_contacts,
            merged_by_id=user.id,
        ))
        log_action(db, "vendor", source.id, "MERGE_INTO", user_id=user.id,
                   new_value=f"Merged into vendor #{target_id} ({target.name})")
        log_action(db, "vendor", target_id, "MERGE_FROM", user_id=user.id,
                   new_value=f"Absorbed vendor #{source.id} ({source.name})")

    db.commit()
    db.refresh(target)
    return {"target": vendor_out(target), "contracts_moved": moved,
            "absorbed": absorbed, "batch_id": batch_id}


@router.get("/merges")
def list_merges(
    active_only: bool = True, limit: int = 50, db: Session = Depends(get_db), _: User = Depends(require_viewer)
):
    """Recent merges grouped by batch, most recent first (for undo)."""
    query = db.query(VendorMergeLog).order_by(VendorMergeLog.merged_at.desc())
    if active_only:
        query = query.filter(VendorMergeLog.undone_at.is_(None))
    rows = query.limit(min(limit, 200) * 10).all()

    vendor_names = {v.id: v.name for v in db.query(Vendor).all()}
    users = {u.id: u.name for u in db.query(User).all()}
    batches: dict[str, dict] = {}
    for r in rows:
        b = batches.setdefault(r.batch_id, {
            "batch_id": r.batch_id,
            "target_id": r.target_id,
            "target_name": vendor_names.get(r.target_id, f"#{r.target_id}"),
            "merged_at": r.merged_at.isoformat() if r.merged_at else None,
            "merged_by": users.get(r.merged_by_id),
            "undone": r.undone_at is not None,
            "sources": [],
            "contracts_moved": 0,
        })
        b["sources"].append({"id": r.source_id, "name": vendor_names.get(r.source_id, f"#{r.source_id}")})
        b["contracts_moved"] += len(r.moved_contract_ids or [])
    result = list(batches.values())[: min(limit, 200)]
    return result


@router.post("/merges/{batch_id}/undo")
def undo_merge(
    batch_id: str, db: Session = Depends(get_db), user: User = Depends(require_validator)
):
    """Reverse a merge: restore the source vendors, re-point their contracts back,
    and remove the aliases/addresses/contacts that were folded into the survivor."""
    logs = (
        db.query(VendorMergeLog)
        .filter(VendorMergeLog.batch_id == batch_id, VendorMergeLog.undone_at.is_(None))
        .all()
    )
    if not logs:
        raise HTTPException(404, "No reversible merge found for this batch")

    restored: list[str] = []
    for row in logs:
        source = db.get(Vendor, row.source_id)
        target = db.get(Vendor, row.target_id)
        if source is not None:
            source.deleted_at = None  # bring the source vendor back
            restored.append(source.name)

        # Re-point contracts that still point at the survivor
        for sr in row.moved_contract_ids or []:
            contract = db.get(Contract, sr)
            if contract is not None and contract.vendor_id == row.target_id:
                contract.vendor_id = row.source_id

        # Remove the aliases that were added to the survivor by this merge
        for alias_id in row.added_alias_ids or []:
            alias = db.get(VendorAlias, alias_id)
            if alias is not None and alias.vendor_id == row.target_id:
                db.delete(alias)

        # Remove the addresses/contacts folded into the survivor
        if target is not None:
            if row.added_addresses:
                target.addresses = [a for a in (target.addresses or []) if a not in row.added_addresses]
            if row.added_contacts:
                target.contacts = [c for c in (target.contacts or []) if c not in row.added_contacts]

        row.undone_at = utcnow()
        row.undone_by_id = user.id
        log_action(db, "vendor", row.source_id, "MERGE_UNDO", user_id=user.id,
                   new_value=f"Un-merged from vendor #{row.target_id}")
        log_action(db, "vendor", row.target_id, "MERGE_UNDO", user_id=user.id,
                   new_value=f"Restored vendor #{row.source_id}")

    db.commit()
    return {"restored": restored, "count": len(logs)}


def _normalize_item(name: str) -> str:
    """Loose key for matching the 'same' line item across a vendor's contracts:
    lowercase, drop punctuation, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())).strip()


def _line_item_rate_history(contracts) -> list[dict]:
    """Year-on-year unit-rate history, matching line items by normalized name
    across all of the vendor's contracts. `contracts` must be ordered oldest to
    newest so the latest label/unit/rate wins for a given year.

    Returns a list of {item, unit, rates_by_year, changes, latest_pct_change},
    only for items that carry a unit rate in at least one year.
    """
    groups: dict[str, dict] = {}
    for c in contracts:
        if c.start_date is None:
            continue
        year = str(c.start_date.year)
        for li in (c.line_items or []):
            if not isinstance(li, dict):
                continue
            rate = li.get("unit_rate")
            if rate is None:
                continue
            try:
                rate = float(rate)
            except (TypeError, ValueError):
                continue
            key = _normalize_item(li.get("item") or "")
            if not key:
                continue
            g = groups.setdefault(key, {"item": None, "unit": None, "rates_by_year": {}})
            g["item"] = li.get("item") or g["item"]      # newest label wins (ascending order)
            g["unit"] = li.get("unit") or g["unit"]
            g["rates_by_year"][year] = rate               # newest contract in the year wins

    history = []
    for g in groups.values():
        years = sorted(g["rates_by_year"])
        changes = []
        for prev, curr in zip(years, years[1:]):
            fr, to = g["rates_by_year"][prev], g["rates_by_year"][curr]
            pct = round((to - fr) / fr * 100, 1) if fr else None
            changes.append({"from_year": prev, "to_year": curr,
                            "from_rate": fr, "to_rate": to, "pct_change": pct})
        history.append({
            "item": g["item"],
            "unit": g["unit"],
            "rates_by_year": g["rates_by_year"],
            "changes": changes,
            "latest_pct_change": changes[-1]["pct_change"] if changes else None,
        })
    # Items with the most recent movement first, then alphabetically
    history.sort(key=lambda h: (h["latest_pct_change"] is None,
                                -abs(h["latest_pct_change"] or 0), h["item"] or ""))
    return history


def _vendor_history(db: Session, vendor: Vendor) -> dict:
    contracts = (
        db.query(Contract)
        .filter(Contract.vendor_id == vendor.id, Contract.deleted_at.is_(None))
        .order_by(Contract.start_date.asc().nullslast(), Contract.sr_no.asc())
        .all()
    )

    def display_status(c: Contract) -> str:
        if c.lifecycle_status.value in ("RENEWED", "TERMINATED"):
            return c.lifecycle_status.value
        d = days_to_expiry(c.end_date)
        if d is None:
            return c.lifecycle_status.value
        if d < 0:
            return "EXPIRED"
        if d <= 90:
            return f"EXPIRING_IN_{d}_DAYS"
        return "ACTIVE"

    totals_per_year: dict[str, float] = {}
    for c in contracts:
        if c.contract_value is not None and c.start_date is not None:
            year = str(c.start_date.year)
            totals_per_year[year] = totals_per_year.get(year, 0) + float(c.contract_value)

    # Renewal chains grouped by thread
    threads: dict[int, list[int]] = {}
    for c in contracts:
        tid = c.thread_id or c.sr_no
        threads.setdefault(tid, []).append(c.sr_no)

    audit = (
        db.query(AuditLog, User)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(
            ((AuditLog.entity_type == "vendor") & (AuditLog.entity_id == vendor.id))
            | ((AuditLog.entity_type == "contract") & (AuditLog.entity_id.in_([c.sr_no for c in contracts])))
        )
        .order_by(AuditLog.created_at.desc())
        .limit(200)
        .all()
    )
    return {
        "vendor": vendor_out(vendor),
        "contracts": [
            {**contract_out(c), "display_status": display_status(c),
             "days_to_expiry": days_to_expiry(c.end_date)}
            for c in contracts
        ],
        "totals_per_year": totals_per_year,
        "line_item_rate_history": _line_item_rate_history(contracts),
        "renewal_chains": list(threads.values()),
        "audit": [
            {
                "entity_type": a.entity_type, "entity_id": a.entity_id, "action": a.action,
                "field": a.field, "old_value": a.old_value, "new_value": a.new_value,
                "user": u.name if u else None, "created_at": a.created_at.isoformat(),
            }
            for a, u in audit
        ],
    }


@router.get("/{vendor_id}/history")
def vendor_history(vendor_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None or vendor.deleted_at is not None:
        raise HTTPException(404, "Vendor not found")
    return _vendor_history(db, vendor)


@router.get("/{vendor_id}/export")
def vendor_export(vendor_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    vendor = db.get(Vendor, vendor_id)
    if vendor is None:
        raise HTTPException(404, "Vendor not found")
    contracts = (
        db.query(Contract)
        .filter(Contract.vendor_id == vendor.id, Contract.deleted_at.is_(None))
        .order_by(Contract.sr_no)
        .all()
    )
    data = contracts_to_register_xlsx(contracts, title=f"{vendor.name} contracts")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="vendor_{vendor.id}_history.xlsx"'},
    )
