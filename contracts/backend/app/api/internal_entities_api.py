"""Internal (organization) entity master — admin CRUD.

Each entity has a canonical `name` and a list of `aliases` (abbreviations /
legal‑name variants). The extractor is guided to output the canonical name and
the pipeline snaps similar‑looking names to it.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import Contract, InternalEntity, User
from ..services.internal_entities import normalize_entity_name as normalize_vendor_name

router = APIRouter(prefix="/internal-entities", tags=["internal-entities"])


class EntityIn(BaseModel):
    name: str
    aliases: list[str] = []


class EntityMerge(BaseModel):
    source_ids: list[int]


class RepointIn(BaseModel):
    from_values: list[str]       # the captured signing-entity strings to consolidate
    to_name: str                 # canonical entity name to re-point them to
    add_as_aliases: bool = True  # also learn each variant as an alias for future extraction


def _clean_aliases(aliases: list[str]) -> list[str]:
    out, seen = [], set()
    for a in aliases or []:
        a = (a or "").strip()
        if a and a.lower() not in seen:
            out.append(a)
            seen.add(a.lower())
    return out


def _out(e: InternalEntity) -> dict:
    return {"id": e.id, "name": e.name, "aliases": list(e.aliases or [])}


@router.get("")
def list_entities(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = (
        db.query(InternalEntity)
        .filter(InternalEntity.deleted_at.is_(None))
        .order_by(InternalEntity.name)
        .all()
    )
    return [_out(e) for e in rows]


@router.post("")
def create_entity(payload: EntityIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    norm = normalize_vendor_name(name)
    for other in db.query(InternalEntity).filter(InternalEntity.deleted_at.is_(None)).all():
        if normalize_vendor_name(other.name) == norm:
            raise HTTPException(400, f"An internal entity already exists for that name (“{other.name}”).")
    e = InternalEntity(name=name, aliases=_clean_aliases(payload.aliases))
    db.add(e)
    db.flush()
    log_action(db, "internal_entity", e.id, "CREATE", user_id=user.id, new_value=name)
    db.commit()
    return _out(e)


@router.put("/{entity_id}")
def update_entity(entity_id: int, payload: EntityIn, db: Session = Depends(get_db),
                  user: User = Depends(require_admin)):
    e = db.get(InternalEntity, entity_id)
    if e is None or e.deleted_at is not None:
        raise HTTPException(404, "Internal entity not found")
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    norm = normalize_vendor_name(name)
    for other in (
        db.query(InternalEntity)
        .filter(InternalEntity.id != entity_id, InternalEntity.deleted_at.is_(None))
        .all()
    ):
        if normalize_vendor_name(other.name) == norm:
            raise HTTPException(400, f"Another internal entity already uses that name (“{other.name}”).")

    old_name = e.name
    # A rename is any change to the displayed string. (Note: normalize_vendor_name
    # strips company suffixes like "Inc"/"Ltd", so "X Inc" and "X Limited" would
    # look identical to it — we must compare the raw strings here.)
    renamed = old_name.strip() != name
    e.name = name
    aliases = _clean_aliases(payload.aliases)
    # On a real rename, carry the contracts with it: re-point any live contract
    # whose signing entity still reads the old canonical name to the new one, so
    # the dashboard reflects the rename instead of stranding the old spelling.
    moved = 0
    if renamed:
        old_norm = normalize_vendor_name(old_name)
        for contract in (
            db.query(Contract)
            .filter(Contract.signing_entity.isnot(None), Contract.deleted_at.is_(None))
            .all()
        ):
            cur = contract.signing_entity or ""
            if cur == name:
                continue
            if cur.strip() == old_name.strip() or normalize_vendor_name(cur) == old_norm:
                log_action(db, "contract", contract.sr_no, "ENTITY_RENAME_REPOINT", user_id=user.id,
                           field="signing_entity", old_value=cur, new_value=name)
                contract.signing_entity = name
                moved += 1
        # Remember the old name as an alias so historical documents still resolve.
        if old_name.strip() and old_name.strip() not in aliases:
            aliases = aliases + [old_name.strip()]
    e.aliases = _clean_aliases(aliases)
    log_action(db, "internal_entity", e.id, "UPDATE", user_id=user.id,
               old_value=old_name, new_value=name)
    db.commit()
    out = _out(e)
    out["contracts_repointed"] = moved
    return out


@router.get("/captured-values")
def captured_values(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Every distinct signing-entity string currently on live contracts, with its
    count and the canonical entity it resolves to (if any).

    This surfaces the "same entity captured under several spellings" problem: two
    values that resolve to the same canonical (or one that resolves to none) are
    candidates to consolidate onto a predefined entity.
    """
    from ..services.internal_entities import match_canonical
    from ..services.settings_store import get_setting
    legacy = get_setting(db, "organization_entities")
    rows = (
        db.query(Contract.signing_entity, func.count(Contract.sr_no))
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.signing_entity.isnot(None))
        .filter(Contract.signing_entity != "")
        .group_by(Contract.signing_entity)
        .all()
    )
    canonical_names = {e.name for e in db.query(InternalEntity).filter(InternalEntity.deleted_at.is_(None)).all()}
    out = []
    for value, count in rows:
        v = (value or "").strip()
        if not v:
            continue
        canonical = match_canonical(db, v, legacy)
        out.append({
            "value": v,
            "count": count,
            "canonical": canonical,
            "is_canonical": v in canonical_names,
        })
    out.sort(key=lambda r: (r["canonical"] or "~", r["value"].lower()))
    return {"values": out}


@router.post("/repoint")
def repoint_signing_entity(payload: RepointIn, db: Session = Depends(get_db),
                           user: User = Depends(require_admin)):
    """Consolidate captured signing-entity strings onto one canonical entity:
    re-point every live contract whose signing entity is one of ``from_values``
    to ``to_name``. Optionally records each re-pointed variant as an alias of the
    target entity so future extraction snaps to it automatically."""
    target_name = (payload.to_name or "").strip()
    if not target_name:
        raise HTTPException(400, "A target entity name is required")
    entity = (
        db.query(InternalEntity)
        .filter(InternalEntity.name == target_name, InternalEntity.deleted_at.is_(None))
        .first()
    )
    if entity is None:
        raise HTTPException(404, f"No predefined internal entity named '{target_name}'. Add it first.")

    from_norms = {normalize_vendor_name(v) for v in payload.from_values if (v or "").strip()}
    if not from_norms:
        raise HTTPException(400, "Select at least one captured value to re-point")

    moved = 0
    learned: list[str] = []
    existing_aliases = {normalize_vendor_name(a) for a in (entity.aliases or [])}
    existing_aliases.add(normalize_vendor_name(entity.name))
    target_norm = normalize_vendor_name(target_name)
    for contract in (
        db.query(Contract)
        .filter(Contract.signing_entity.isnot(None), Contract.deleted_at.is_(None))
        .all()
    ):
        raw = contract.signing_entity or ""
        if not raw.strip() or raw == target_name:
            continue  # already exactly the canonical string
        if normalize_vendor_name(raw) in from_norms:
            log_action(db, "contract", contract.sr_no, "ENTITY_REPOINT", user_id=user.id,
                       field="signing_entity", old_value=raw, new_value=target_name)
            contract.signing_entity = target_name
            moved += 1
            # Learn only genuinely different spellings as aliases (not mere
            # whitespace/case/punctuation variants that normalize to the target).
            norm = normalize_vendor_name(raw)
            if payload.add_as_aliases and norm != target_norm and norm not in existing_aliases:
                learned.append(raw.strip())
                existing_aliases.add(norm)

    if learned:
        entity.aliases = list(entity.aliases or []) + learned
    log_action(db, "internal_entity", entity.id, "REPOINT_CONTRACTS", user_id=user.id,
               new_value=f"{moved} contract(s) -> {target_name}")
    db.commit()
    return {"to_name": target_name, "contracts_moved": moved, "aliases_learned": learned}


@router.post("/{target_id}/merge")
def merge_entities(
    target_id: int, payload: EntityMerge, db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Fold one or more source entities into the target: re-point every contract
    whose signing entity matches a source (by canonical name or alias) to the
    target's canonical name, absorb the sources' names/aliases as target aliases,
    then soft-delete the sources."""
    target = db.get(InternalEntity, target_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(404, "Target entity not found")

    existing_aliases = {normalize_vendor_name(a) for a in (target.aliases or [])}
    existing_aliases.add(normalize_vendor_name(target.name))
    absorbed: list[str] = []
    moved = 0

    for source_id in payload.source_ids:
        if source_id == target_id:
            continue
        source = db.get(InternalEntity, source_id)
        if source is None or source.deleted_at is not None:
            continue

        # Every string that could appear as this source's signing entity.
        variants = [source.name] + list(source.aliases or [])
        variant_norms = {normalize_vendor_name(v) for v in variants if v}
        for contract in (
            db.query(Contract)
            .filter(Contract.signing_entity.isnot(None), Contract.deleted_at.is_(None))
            .all()
        ):
            if normalize_vendor_name(contract.signing_entity) in variant_norms:
                old = contract.signing_entity
                contract.signing_entity = target.name
                moved += 1
                log_action(db, "contract", contract.sr_no, "ENTITY_MERGE_REPOINT",
                           user_id=user.id, field="signing_entity",
                           old_value=old, new_value=target.name)

        # The source name + its aliases become aliases of the survivor.
        new_aliases = list(target.aliases or [])
        for v in variants:
            nv = normalize_vendor_name(v)
            if v and nv and nv not in existing_aliases:
                new_aliases.append(v)
                existing_aliases.add(nv)
        target.aliases = new_aliases

        source.deleted_at = datetime.now(timezone.utc)
        absorbed.append(source.name)
        log_action(db, "internal_entity", source.id, "MERGE_INTO", user_id=user.id,
                   new_value=f"Merged into #{target_id} ({target.name})")
        log_action(db, "internal_entity", target_id, "MERGE_FROM", user_id=user.id,
                   new_value=f"Absorbed #{source.id} ({source.name})")

    db.commit()
    return {"target": _out(target), "absorbed": absorbed, "contracts_moved": moved}


@router.delete("/{entity_id}")
def delete_entity(entity_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    e = db.get(InternalEntity, entity_id)
    if e is None or e.deleted_at is not None:
        raise HTTPException(404, "Internal entity not found")
    e.deleted_at = datetime.now(timezone.utc)
    log_action(db, "internal_entity", e.id, "SOFT_DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}
