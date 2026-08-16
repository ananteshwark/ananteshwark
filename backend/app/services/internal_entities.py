"""Internal (organization) entity master: canonical names + aliases.

Drives two things during extraction:
  1. prompt guidance — the AI is told each canonical name and its known variants
     and asked to output the exact canonical name for the signing entity;
  2. deterministic canonicalization — after extraction the signing entity is
     snapped to the matching canonical name (belt‑and‑suspenders, works offline).

Also the single source of truth for the org‑entity swap guard's name list, so
adding an entity here immediately teaches the guard and the extractor.
"""
from __future__ import annotations

import re

from rapidfuzz import fuzz

from ..models import InternalEntity
from .org_entities import parse_entities

_MATCH_THRESHOLD = 90

# Abbreviations that mean the SAME thing — expanded so "Pvt Ltd" == "Private
# Limited" and "Ind" == "India". Unlike vendor matching, we deliberately DO NOT
# strip corporate suffixes here: two org entities differing only by a *distinct*
# suffix (e.g. "X Inc" vs "X Limited") must stay separate, so the suffix token is
# kept and only known abbreviations are canonicalized to one spelling.
_ENTITY_ABBREV = {
    "pvt": "private",
    "ltd": "limited",
    "ind": "india",
}

_ENTITY_PUNCT_RE = re.compile(r"[.,&()\-_/]")


def normalize_entity_name(name: str | None) -> str:
    """Normalize an internal-entity name for matching: lowercase, drop punctuation
    and extra whitespace, and expand known abbreviations (Pvt→Private, Ltd→Limited,
    Ind→India, …). Corporate suffixes are kept (not stripped), so "X Inc" and
    "X Limited" remain distinct while punctuation/spacing/abbreviation variants of
    the *same* name collapse together."""
    if not name:
        return ""
    text = name.lower().strip()
    # Expand "&" before it is stripped as punctuation.
    text = text.replace("&", " and ")
    text = _ENTITY_PUNCT_RE.sub(" ", text)
    tokens = [_ENTITY_ABBREV.get(t, t) for t in text.split()]
    return re.sub(r"\s+", " ", " ".join(tokens)).strip()


# Internal alias so the rest of this module reads naturally.
normalize_vendor_name = normalize_entity_name


def load_entities(db) -> list[dict]:
    rows = (
        db.query(InternalEntity)
        .filter(InternalEntity.deleted_at.is_(None))
        .order_by(InternalEntity.name)
        .all()
    )
    return [{"id": e.id, "name": e.name, "aliases": list(e.aliases or [])} for e in rows]


def entity_variants(db, legacy_raw: str | None = None) -> list[tuple[str, list[str]]]:
    """[(canonical, [name + aliases])]. Includes legacy `organization_entities`
    setting values (each as its own canonical) so nothing is lost pre‑migration."""
    out: list[tuple[str, list[str]]] = []
    seen: set[str] = set()
    for e in load_entities(db):
        variants = [e["name"]] + [a for a in e["aliases"] if a]
        out.append((e["name"], variants))
        seen.add(normalize_vendor_name(e["name"]))
    for name in parse_entities(legacy_raw):
        if normalize_vendor_name(name) not in seen:
            out.append((name, [name]))
            seen.add(normalize_vendor_name(name))
    return out


def flat_names(db, legacy_raw: str | None = None) -> list[str]:
    """Every canonical name and alias — the list the swap guard checks against."""
    names: list[str] = []
    for _canonical, variants in entity_variants(db, legacy_raw):
        names.extend(variants)
    return names


def match_canonical(db, name: str | None, legacy_raw: str | None = None) -> str | None:
    """Canonical name for `name` if it matches an internal entity (by whole‑token
    containment or high fuzzy score), else None."""
    n = normalize_vendor_name(name)
    if not n:
        return None
    nt = set(n.split())
    best, best_score = None, 0
    for canonical, variants in entity_variants(db, legacy_raw):
        for v in variants:
            nv = normalize_vendor_name(v)
            if not nv:
                continue
            vt = set(nv.split())
            if vt and (vt <= nt or nt <= vt):
                return canonical
            score = fuzz.token_set_ratio(nv, n)
            if score > best_score:
                best_score, best = score, canonical
    return best if best_score >= _MATCH_THRESHOLD else None


def canonicalize_signing_entity(db, data: dict, legacy_raw: str | None = None) -> tuple[dict, bool]:
    """Snap data['signing_entity'] to the matching canonical name. Returns
    (data, changed?)."""
    current = data.get("signing_entity")
    canonical = match_canonical(db, current, legacy_raw)
    if canonical and normalize_vendor_name(canonical) != normalize_vendor_name(current or ""):
        data = dict(data)
        data["signing_entity"] = canonical
        return data, True
    return data, False


def has_entities(db, legacy_raw: str | None = None) -> bool:
    """True if any predefined internal entity exists (master table or legacy
    setting). Enforcement is only meaningful once at least one is defined."""
    return bool(entity_variants(db, legacy_raw))


def resolve_signing_entity(
    db, name: str | None, legacy_raw: str | None = None
) -> tuple[str | None, bool]:
    """Resolve a signing-entity name against the predefined master.

    Returns ``(canonical_or_original, ok)``:
      * empty name           -> (None, True)   — emptiness is handled elsewhere
      * no entities defined   -> (name, True)   — nothing to enforce against yet
      * matches an entity     -> (canonical, True)
      * set but no match      -> (name, False)  — caller should reject/hold

    This is the single gate behind "contracts accept only predefined entities":
    a matched value is snapped to its canonical form; an unmatched value fails.
    """
    if not (name or "").strip():
        return None, True
    if not has_entities(db, legacy_raw):
        return name, True
    canonical = match_canonical(db, name, legacy_raw)
    if canonical:
        return canonical, True
    return name, False


def prompt_guidance(db, legacy_raw: str | None = None) -> str:
    """Human‑readable canonical/alias guidance injected into the extraction prompt."""
    parts = []
    for canonical, variants in entity_variants(db, legacy_raw):
        aliases = [v for v in variants if normalize_vendor_name(v) != normalize_vendor_name(canonical)]
        if aliases:
            parts.append(f"{canonical} (also written as: {', '.join(aliases)})")
        else:
            parts.append(canonical)
    return "; ".join(parts)
