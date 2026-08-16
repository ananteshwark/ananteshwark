"""Clause Library API: search, version management (approve/deprecate/edit/merge),
the learning batch job, and the admin-extensible taxonomy."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_author, require_legal, require_viewer
from ..database import get_db
from ..models import (
    ClauseLibraryEntry,
    ClauseStatus,
    ClauseUsage,
    ClauseVersion,
    RiskPosture,
    User,
)
from ..services import clauses as C

router = APIRouter(prefix="/clauses", tags=["clauses"])


class VersionEdit(BaseModel):
    label: str | None = None
    text: str | None = None
    polished_text: str | None = None
    summary: str | None = None
    risk_posture: str | None = None
    legal_approved: bool | None = None
    status: str | None = None


class CurateRequest(BaseModel):
    clause_type: str | None = None   # omit to curate/backfill the whole library
    use_ai: bool | None = None       # None -> follow the configured AI setting
    refresh: bool = False            # re-polish versions that already have polished text
    compact: bool = True             # retire versions beyond the top 5 (keep only 5)


class NewVersion(BaseModel):
    clause_type: str
    text: str
    label: str | None = None
    risk_posture: str | None = None


class MergeVersions(BaseModel):
    keep_id: int
    merge_id: int


# Ordered from most-favourable (to us) to the last acceptable position; anything
# past 'walkaway' is off the table. None removes a version from the playbook.
PLAYBOOK_TIERS = ("standard", "fallback", "walkaway")


class TierRequest(BaseModel):
    tier: str | None = None   # standard | fallback | walkaway | null (remove)


class Taxonomy(BaseModel):
    types: list[str]


def _version_out(v: ClauseVersion, detail: bool = False) -> dict:
    out = {
        "id": v.id, "entry_id": v.entry_id, "clause_type": v.entry.clause_type,
        "label": v.label, "risk_posture": v.risk_posture.value, "status": v.status.value,
        "legal_approved": v.legal_approved, "usage_count": v.usage_count,
        "first_used": v.first_used.isoformat() if v.first_used else None,
        "last_used": v.last_used.isoformat() if v.last_used else None,
        "summary": v.summary,
        # 2.13: the clause text is available on the list view, not only on drill-in.
        "text": v.text,
        "polished_text": v.polished_text,
        "is_curated": bool(v.is_curated),
        "curated_rank": v.curated_rank,
        "playbook_tier": v.playbook_tier,
    }
    if detail:
        out["text"] = v.text
        # sibling versions for difference context
        out["siblings"] = [
            {"id": s.id, "label": s.label, "risk_posture": s.risk_posture.value,
             "status": s.status.value, "usage_count": s.usage_count, "summary": s.summary}
            for s in v.entry.versions if s.id != v.id and s.deleted_at is None
        ]
        # usage breakdown
        vendors = sorted({u.vendor_id for u in v.usages if u.vendor_id})
        depts = sorted({u.department_id for u in v.usages if u.department_id})
        out["used_by_vendors"] = len(vendors)
        out["used_by_departments"] = len(depts)
        out["contracts"] = sorted({u.contract_id for u in v.usages if u.contract_id})
    return out


@router.get("/ai-status")
def ai_status(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Whether the authoring AI features will use the configured model."""
    from ..services.ai_client import _resolve, ai_enabled
    provider, _key, model, _base = _resolve(db)
    return {"enabled": ai_enabled(db), "provider": provider, "model": model}


@router.get("/taxonomy")
def get_taxonomy(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    return {"types": C.taxonomy(db)}


@router.put("/taxonomy")
def set_taxonomy(payload: Taxonomy, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    from ..services.settings_store import set_setting
    cleaned = [t.strip() for t in payload.types if t.strip()]
    set_setting(db, "clause_taxonomy", ", ".join(cleaned))
    log_action(db, "settings", 0, "UPDATE", user_id=user.id, field="clause_taxonomy",
               new_value=", ".join(cleaned))
    db.commit()
    return {"types": cleaned}


@router.get("")
def search_clauses(
    clause_type: str | None = None, department_id: int | None = None, vendor_id: int | None = None,
    risk_posture: str | None = None, status: str | None = None, q: str | None = None,
    most_used: bool = False, limit: int = 100,
    db: Session = Depends(get_db), _: User = Depends(require_viewer),
):
    """Clause-library search. Indexed columns keep this fast over large sets."""
    query = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.deleted_at.is_(None))
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
    )
    if clause_type:
        query = query.filter(ClauseLibraryEntry.clause_type == clause_type)
    if risk_posture:
        query = query.filter(ClauseVersion.risk_posture == RiskPosture(risk_posture))
    if status:
        query = query.filter(ClauseVersion.status == ClauseStatus(status))
    if q:
        query = query.filter(ClauseVersion.text.ilike(f"%{q}%"))
    if department_id or vendor_id:
        query = query.join(ClauseUsage, ClauseUsage.version_id == ClauseVersion.id)
        if department_id:
            query = query.filter(ClauseUsage.department_id == department_id)
        if vendor_id:
            query = query.filter(ClauseUsage.vendor_id == vendor_id)
        query = query.distinct()
    if most_used:
        query = query.order_by(ClauseVersion.usage_count.desc())
    else:
        query = query.order_by(ClauseLibraryEntry.clause_type, ClauseVersion.usage_count.desc())
    rows = query.limit(min(limit, 500)).all()
    return [_version_out(v) for v in rows]


@router.get("/stats")
def library_stats(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Counts per clause type for the library overview."""
    rows = (
        db.query(ClauseLibraryEntry.clause_type, func.count(ClauseVersion.id),
                 func.coalesce(func.sum(ClauseVersion.usage_count), 0))
        .join(ClauseVersion, ClauseVersion.entry_id == ClauseLibraryEntry.id)
        .filter(ClauseVersion.deleted_at.is_(None), ClauseLibraryEntry.deleted_at.is_(None))
        .group_by(ClauseLibraryEntry.clause_type)
        .all()
    )
    return [{"clause_type": t, "versions": vc, "usage": int(u)} for t, vc, u in rows]


# Registered before "/{version_id}" so the literal path wins over the id capture.
@router.post("/curate")
def curate(payload: CurateRequest, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Curate the top-N most-used versions per clause type and polish them.
    With no clause_type this backfills the entire existing library."""
    from ..services.clause_curation import curate_library
    result = curate_library(db, clause_type=payload.clause_type, use_ai=payload.use_ai,
                            refresh=payload.refresh, compact=payload.compact)
    log_action(db, "clause_library", 0, "CURATE", user_id=user.id,
               new_value=f"{result['curated']} curated, {result['polished']} polished, "
                         f"{result.get('retired', 0)} retired")
    db.commit()
    return result


@router.get("/curated")
def list_curated(clause_type: str | None = None, db: Session = Depends(get_db),
                 _: User = Depends(require_viewer)):
    """Curated top-N versions (with polished text), grouped-friendly ordering."""
    query = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.is_curated.is_(True))
        .filter(ClauseVersion.deleted_at.is_(None))
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
    )
    if clause_type:
        query = query.filter(ClauseLibraryEntry.clause_type == clause_type)
    rows = query.order_by(ClauseLibraryEntry.clause_type, ClauseVersion.curated_rank).all()
    return [_version_out(v, detail=True) for v in rows]


@router.get("/playbook")
def get_playbook(clause_type: str | None = None, db: Session = Depends(get_db),
                 _: User = Depends(require_viewer)):
    """The negotiation playbook: clause versions grouped by type, split into the
    standard / fallback / walkaway tiers Legal has designated. Drives the author
    negotiation aids and the deviation scoring (B2)."""
    query = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.playbook_tier.isnot(None))
        .filter(ClauseVersion.deleted_at.is_(None))
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
    )
    if clause_type:
        query = query.filter(ClauseLibraryEntry.clause_type == clause_type)
    rows = query.order_by(ClauseLibraryEntry.clause_type).all()

    tier_rank = {t: i for i, t in enumerate(PLAYBOOK_TIERS)}
    by_type: dict[str, list] = {}
    for v in rows:
        by_type.setdefault(v.entry.clause_type, []).append(v)
    out = []
    for ctype in sorted(by_type):
        vs = sorted(by_type[ctype], key=lambda v: tier_rank.get(v.playbook_tier, 99))
        out.append({
            "clause_type": ctype,
            "tiers": {t: [_version_out(v) for v in vs if v.playbook_tier == t]
                      for t in PLAYBOOK_TIERS},
        })
    return out


@router.get("/clusters")
def clause_clusters(clause_type: str | None = None, threshold: float = 0.82,
                    db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Group near-duplicate versions (embedding cosine) so they can be merged.
    Uses an offline hashing-embedding; returns only multi-member clusters."""
    from ..services.embeddings import cluster as embed_cluster
    query = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.deleted_at.is_(None))
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
    )
    if clause_type:
        query = query.filter(ClauseLibraryEntry.clause_type == clause_type)
    versions = query.all()
    by_type: dict[str, list] = {}
    for v in versions:
        by_type.setdefault(v.entry.clause_type, []).append(v)

    out = []
    for ctype, vs in by_type.items():
        by_id = {v.id: v for v in vs}
        for group in embed_cluster([(v.id, v.text or "") for v in vs], threshold=threshold):
            if len(group) < 2:
                continue
            members = [by_id[i] for i in group]
            # Representative = most-used version in the cluster.
            members.sort(key=lambda v: -(v.usage_count or 0))
            out.append({
                "clause_type": ctype,
                "representative_id": members[0].id,
                "members": [{"id": m.id, "label": m.label, "usage_count": m.usage_count,
                             "status": m.status.value, "text": (m.text or "")[:280]} for m in members],
            })
    out.sort(key=lambda c: -len(c["members"]))
    return out


@router.get("/{version_id}")
def get_version(version_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    return _version_out(v, detail=True)


@router.post("/versions")
def add_version(payload: NewVersion, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Manually add a clause version (Legal authoring a standard clause)."""
    version, _created = C.match_or_create_version(db, payload.clause_type, payload.text)
    if payload.label:
        version.label = payload.label
    if payload.risk_posture:
        version.risk_posture = RiskPosture(payload.risk_posture)
    db.flush()
    log_action(db, "clause_version", version.id, "CREATE", user_id=user.id,
               new_value=f"{payload.clause_type} {version.label}")
    db.commit()
    return _version_out(version, detail=True)


@router.put("/versions/{version_id}")
def edit_version(version_id: int, payload: VersionEdit, db: Session = Depends(get_db),
                 user: User = Depends(require_author)):
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    # Only Legal (or Admin) may alter a legal-approved clause version.
    from ..models import UserRole
    if v.legal_approved and user.role not in (UserRole.ADMIN, UserRole.LEGAL):
        raise HTTPException(403, "Only Legal can modify a legal-approved clause")
    if payload.label is not None:
        v.label = payload.label
    if payload.text is not None:
        v.text = payload.text
        v.normalized = C.normalize_clause(payload.text)
    if payload.polished_text is not None:
        v.polished_text = payload.polished_text
    if payload.summary is not None:
        v.summary = payload.summary
    if payload.risk_posture is not None:
        v.risk_posture = RiskPosture(payload.risk_posture)
    if payload.legal_approved is not None:
        v.legal_approved = payload.legal_approved
    if payload.status is not None:
        v.status = ClauseStatus(payload.status)
    log_action(db, "clause_version", v.id, "UPDATE", user_id=user.id)
    db.commit()
    return _version_out(v, detail=True)


@router.post("/versions/{version_id}/playbook-tier")
def set_playbook_tier(version_id: int, payload: TierRequest, db: Session = Depends(get_db),
                      user: User = Depends(require_legal)):
    """Legal designates a clause version's playbook tier (standard/fallback/
    walkaway), or clears it. Only one 'standard' per clause type is meaningful,
    so setting standard demotes any prior standard of the same type to fallback."""
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    tier = (payload.tier or "").strip().lower() or None
    if tier is not None and tier not in PLAYBOOK_TIERS:
        raise HTTPException(400, f"tier must be one of {', '.join(PLAYBOOK_TIERS)} or null")
    if tier == "standard":
        # Demote any existing standard of the same clause type to fallback.
        prior = (
            db.query(ClauseVersion)
            .filter(ClauseVersion.entry_id == v.entry_id,
                    ClauseVersion.playbook_tier == "standard",
                    ClauseVersion.id != v.id,
                    ClauseVersion.deleted_at.is_(None))
            .all()
        )
        for p in prior:
            p.playbook_tier = "fallback"
    v.playbook_tier = tier
    log_action(db, "clause_version", v.id, "PLAYBOOK_TIER", user_id=user.id,
               new_value=tier or "(cleared)")
    db.commit()
    return _version_out(v, detail=True)


@router.post("/versions/{version_id}/summarize")
def summarize_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Generate the plain-language difference summary for a clause version using
    the configured AI model (deterministic fallback when AI is off)."""
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    summary = C.summarize_version(db, v)
    db.commit()
    return {"id": v.id, "summary": summary}


@router.post("/versions/{version_id}/polish")
def polish_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """(Re)generate the AI-polished, editable wording for a single clause version."""
    from ..services.clause_curation import polish_text
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    v.polished_text = polish_text(db, v.text, v.entry.clause_type)
    log_action(db, "clause_version", v.id, "POLISH", user_id=user.id)
    db.commit()
    return _version_out(v, detail=True)


@router.post("/versions/{version_id}/approve")
def approve_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(require_legal)):
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    v.status = ClauseStatus.APPROVED
    v.legal_approved = True
    log_action(db, "clause_version", v.id, "APPROVE", user_id=user.id)
    db.commit()
    return _version_out(v, detail=True)


@router.post("/versions/{version_id}/deprecate")
def deprecate_version(version_id: int, db: Session = Depends(get_db), user: User = Depends(require_legal)):
    v = db.get(ClauseVersion, version_id)
    if v is None or v.deleted_at is not None:
        raise HTTPException(404, "Clause version not found")
    v.status = ClauseStatus.DEPRECATED
    log_action(db, "clause_version", v.id, "DEPRECATE", user_id=user.id)
    db.commit()
    return _version_out(v, detail=True)


@router.post("/versions/merge")
def merge_versions(payload: MergeVersions, db: Session = Depends(get_db), user: User = Depends(require_author)):
    """Fold merge_id into keep_id: re-point usages, sum counts, soft-delete the
    merged version. Both must be the same clause type."""
    keep = db.get(ClauseVersion, payload.keep_id)
    merge = db.get(ClauseVersion, payload.merge_id)
    if not keep or not merge or keep.deleted_at or merge.deleted_at:
        raise HTTPException(404, "Version not found")
    if keep.entry_id != merge.entry_id:
        raise HTTPException(400, "Versions belong to different clause types")
    for u in list(merge.usages):
        u.version_id = keep.id
    keep.usage_count = (keep.usage_count or 0) + (merge.usage_count or 0)
    if merge.first_used and (keep.first_used is None or merge.first_used < keep.first_used):
        keep.first_used = merge.first_used
    if merge.last_used and (keep.last_used is None or merge.last_used > keep.last_used):
        keep.last_used = merge.last_used
    merge.deleted_at = datetime.now(timezone.utc)
    log_action(db, "clause_version", keep.id, "MERGE", user_id=user.id,
               new_value=f"merged {merge.id} into {keep.id}")
    db.commit()
    return _version_out(keep, detail=True)


# ---------------------------------------------------------------------------
# Learning batch job
# ---------------------------------------------------------------------------

@router.post("/learn")
def run_learn(reset: bool = False, use_ai: bool | None = None,
              db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Learn clauses from all existing contracts (resumable). Runs inline; for
    very large corpora this is safe to call repeatedly to continue.

    `use_ai` picks the segmentation engine: omit to follow the admin AI toggle
    (Claude/configured model when available), or force true/false. AI
    segmentation calls the model once per contract.
    """
    result = C.run_learning_job(db, reset=reset, use_ai=use_ai)
    log_action(db, "clause_library", 0, "LEARN_RUN", user_id=user.id,
               new_value=f"processed {result['processed']}, clauses {result['clauses']}, "
                         f"ai={result.get('ai_used', 0)}")
    return result


@router.get("/learn/status")
def learn_status(_: User = Depends(require_viewer)):
    return dict(C.learn_progress)
