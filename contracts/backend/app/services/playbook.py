"""Playbook deviation detection & risk scoring (G3/B2).

Compares a draft's clauses against the negotiation playbook Legal has set on the
clause library (standard / fallback / walk-away tiers) and reports, per clause
type, how far the draft has drifted from the preferred position — plus an
aggregate risk score. Deterministic and offline: similarity is difflib-based,
the same engine the clause library uses for version matching.
"""
from __future__ import annotations

from ..models import ClauseLibraryEntry, ClauseVersion
from .clauses import classify_clause, normalize_clause, segment_and_classify, segment_text, similarity

# Below this text-similarity a draft clause is considered NOT to match a tier.
_TIER_MATCH = 0.55

# Ordered best-to-worst. A draft clause is scored against the best tier it still
# matches, walking down this list.
_TIERS = ("standard", "fallback", "walkaway")

# Per-position risk points and the human label shown to the author/reviewer.
_POSITION = {
    "standard":     {"points": 0,  "label": "On standard",          "level": "ok"},
    "fallback":     {"points": 3,  "label": "Fallback position",     "level": "watch"},
    "walkaway":     {"points": 7,  "label": "At walk-away",          "level": "high"},
    "off_playbook": {"points": 10, "label": "Off-playbook",          "level": "high"},
    "missing":      {"points": 5,  "label": "Playbook clause absent", "level": "watch"},
}


def _playbook_entries(db) -> dict[str, dict[str, list[ClauseVersion]]]:
    """{clause_type: {tier: [versions]}} for every clause type with any tier set."""
    rows = (
        db.query(ClauseVersion)
        .join(ClauseLibraryEntry, ClauseLibraryEntry.id == ClauseVersion.entry_id)
        .filter(ClauseVersion.playbook_tier.isnot(None))
        .filter(ClauseVersion.deleted_at.is_(None))
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
        .all()
    )
    out: dict[str, dict[str, list[ClauseVersion]]] = {}
    for v in rows:
        by_tier = out.setdefault(v.entry.clause_type, {t: [] for t in _TIERS})
        if v.playbook_tier in by_tier:
            by_tier[v.playbook_tier].append(v)
    return out


def _best_in_tier(norm: str, versions: list[ClauseVersion]) -> tuple[float, ClauseVersion | None]:
    """Highest text similarity between the draft block and any version in a tier."""
    best, best_v = 0.0, None
    for v in versions:
        r = similarity(norm, v.normalized or normalize_clause(v.text or ""))
        if r > best:
            best, best_v = r, v
    return best, best_v


def _classify_block(norm: str, tiers: dict[str, list[ClauseVersion]]) -> dict:
    """Which playbook position a draft clause block sits at. The block is
    assigned to the tier whose wording it most closely resembles: a clause that
    reproduces the fallback text verbatim is a fallback position even though it
    also loosely resembles the standard. If it resembles no tier above the match
    threshold, it's past walk-away (off-playbook)."""
    scored = {t: _best_in_tier(norm, tiers.get(t, [])) for t in _TIERS}
    # Highest-similarity tier wins; ties break toward the better (earlier) tier.
    best_tier = max(_TIERS, key=lambda t: (scored[t][0], -_TIERS.index(t)))
    ratio, ver = scored[best_tier]
    if ratio >= _TIER_MATCH:
        return {"position": best_tier, "similarity": round(ratio, 3),
                "matched_version_id": ver.id if ver else None,
                "matched_label": ver.label if ver else None}
    return {"position": "off_playbook", "similarity": round(ratio, 3),
            "closest_tier": best_tier,
            "matched_version_id": ver.id if ver else None,
            "matched_label": ver.label if ver else None}


def analyze_deviations(db, draft) -> dict:
    """Deviation report for a draft against the playbook."""
    from .authoring import render_text
    return analyze_text_deviations(db, render_text(draft.document, draft.fields or {}))


def analyze_contract_deviations(db, contract) -> dict:
    """Deviation report for an executed/validated register contract (F5), scored
    from its extracted text so the whole portfolio can carry a risk position —
    not just in-flight drafts."""
    return analyze_text_deviations(db, contract.extracted_text or "")


def score_contract(db, contract) -> dict:
    """Score a contract and persist the result so it can be filtered, reported,
    trended and gated on."""
    from datetime import datetime, timezone
    result = analyze_contract_deviations(db, contract)
    if result.get("configured"):
        contract.risk_score = result["risk_score"]
        contract.risk_level = result["risk_level"]
        contract.risk_scored_at = datetime.now(timezone.utc)
    return result


def analyze_text_deviations(db, text: str) -> dict:
    """Deviation report for any contract text against the playbook.

    Returns per-clause deviations, a 0-100 risk score (higher = riskier), a
    coarse risk level, and the list of playbook clause types missing entirely.
    Clause types with no playbook tier set are ignored (nothing to deviate from).
    """
    playbook = _playbook_entries(db)
    if not playbook:
        return {"configured": False, "risk_score": 0, "risk_level": "ok",
                "deviations": [], "missing": [], "on_standard": 0}

    # Group the draft's classifiable blocks by clause type (a type may appear in
    # more than one block; keep the block that lands on the best position).
    blocks_by_type: dict[str, list[str]] = {}
    for c in segment_and_classify(text):
        blocks_by_type.setdefault(c["clause_type"], []).append(c["text"])

    deviations: list[dict] = []
    missing: list[str] = []
    points = 0
    weight = 0
    on_standard = 0

    for ctype, tiers in playbook.items():
        present = blocks_by_type.get(ctype)
        if not present:
            missing.append(ctype)
            points += _POSITION["missing"]["points"]
            weight += _POSITION["walkaway"]["points"]  # normalise against worst
            deviations.append({
                "clause_type": ctype, "position": "missing",
                "label": _POSITION["missing"]["label"], "level": _POSITION["missing"]["level"],
                "similarity": None, "matched_version_id": None,
                "note": f"The playbook covers {ctype} but the draft has no such clause.",
            })
            continue
        # Best position across the type's blocks (a later restated clause may be
        # the compliant one).
        best = None
        for block in present:
            info = _classify_block(normalize_clause(block), tiers)
            rank = _TIERS.index(info["position"]) if info["position"] in _TIERS else len(_TIERS)
            if best is None or rank < best[0]:
                best = (rank, info)
        info = best[1]
        pos = info["position"]
        meta = _POSITION[pos]
        points += meta["points"]
        weight += _POSITION["walkaway"]["points"]
        if pos == "standard":
            on_standard += 1
        dev = {
            "clause_type": ctype, "position": pos, "label": meta["label"],
            "level": meta["level"], "similarity": info["similarity"],
            "matched_version_id": info.get("matched_version_id"),
            "matched_label": info.get("matched_label"),
        }
        if pos == "off_playbook":
            dev["note"] = (f"The {ctype} clause doesn't match any approved position "
                           f"(closest: {info.get('closest_tier')}). Legal review needed.")
        elif pos == "walkaway":
            dev["note"] = f"The {ctype} clause is at the walk-away position — the last acceptable wording."
        elif pos == "fallback":
            dev["note"] = f"The {ctype} clause is on a fallback position, not the standard."
        deviations.append(dev)

    risk_score = round(100 * points / weight) if weight else 0
    risk_level = "high" if risk_score >= 50 else "medium" if risk_score >= 20 else "low"
    # Order worst-first so the biggest problems surface at the top.
    order = {"missing": 1, "off_playbook": 0, "walkaway": 2, "fallback": 3, "standard": 4}
    deviations.sort(key=lambda d: order.get(d["position"], 9))
    return {
        "configured": True,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "on_standard": on_standard,
        "playbook_types": sorted(playbook.keys()),
        "missing": missing,
        "deviations": deviations,
    }


def _library_by_type(db) -> dict[str, ClauseLibraryEntry]:
    entries = (
        db.query(ClauseLibraryEntry)
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
        .all()
    )
    return {e.clause_type: e for e in entries}


def _best_library_match(norm: str, entry: ClauseLibraryEntry) -> tuple[float, ClauseVersion | None]:
    best, best_v = 0.0, None
    for v in (entry.versions if entry else []):
        if v.deleted_at is not None:
            continue
        r = similarity(norm, v.normalized or normalize_clause(v.text or ""))
        if r > best:
            best, best_v = r, v
    return best, best_v


def map_clauses(db, draft) -> dict:
    """Map each clause block of (typically third-party) paper onto the clause
    library (G13). For every recognisable block it reports the classified clause
    type, the closest approved library version, and — where a playbook exists —
    the negotiation position that block sits at. Unrecognised blocks are flagged
    so counsel can review the non-standard language a counterparty introduced.
    """
    from .authoring import render_text

    text = render_text(draft.document, draft.fields or {})
    library = _library_by_type(db)
    playbook = _playbook_entries(db)

    mapped: list[dict] = []
    unmapped = 0
    recognised = 0
    for i, block in enumerate(segment_text(text)):
        preview = block[:240] + ("…" if len(block) > 240 else "")
        ctype = classify_clause(block)
        if not ctype:
            unmapped += 1
            mapped.append({"index": i, "clause_type": None, "preview": preview,
                           "matched_version_id": None, "risk_posture": None,
                           "similarity": None, "playbook_position": None,
                           "note": "Unrecognised language — not matched to any clause type."})
            continue
        recognised += 1
        norm = normalize_clause(block)
        ratio, ver = _best_library_match(norm, library.get(ctype))
        entry = {
            "index": i, "clause_type": ctype, "preview": preview,
            "matched_version_id": ver.id if ver else None,
            "matched_label": ver.label if ver else None,
            "risk_posture": ver.risk_posture.value if ver else None,
            "legal_approved": bool(ver.legal_approved) if ver else False,
            "library_similarity": round(ratio, 3) if ver else None,
            "playbook_position": None,
        }
        if ctype in playbook:
            pos = _classify_block(norm, playbook[ctype])
            entry["playbook_position"] = pos["position"]
            entry["playbook_similarity"] = pos["similarity"]
            meta = _POSITION.get(pos["position"], {})
            entry["playbook_level"] = meta.get("level")
            entry["playbook_label"] = meta.get("label")
        mapped.append(entry)

    return {
        "clauses": mapped,
        "recognised": recognised,
        "unmapped": unmapped,
        "total_blocks": len(mapped),
        "has_playbook": bool(playbook),
    }
