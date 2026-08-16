"""Deterministic guard: ensure a known organization entity is never recorded as
the vendor.

Even with the prompt guidance, the model can occasionally place one of our own
organization names in the `vendor` field. After extraction we check the result
against the configured organization-entity list and, if the vendor is one of
ours while the signing entity is not, swap them (and their matching signing
authorities). This is a belt-and-suspenders correction on top of the prompt.
"""
from rapidfuzz import fuzz

from .vendor_matching import normalize_vendor_name


def parse_entities(raw: str | None) -> list[str]:
    return [e.strip() for e in (raw or "").replace("\n", ",").split(",") if e.strip()]


def matches_org_entity(name: str | None, entities: list[str]) -> bool:
    """True if `name` refers to one of our organization entities.

    Uses whole-token containment (so "Inventurus Knowledge Solutions" matches the
    entity "Inventurus", but a vendor "Briks" never matches the alias "IKS") plus
    a high-threshold fuzzy fallback.
    """
    n = normalize_vendor_name(name)
    if not n:
        return False
    nt = set(n.split())
    for entity in entities:
        ne = normalize_vendor_name(entity)
        if not ne:
            continue
        et = set(ne.split())
        if et and (et <= nt or nt <= et):
            return True
        if fuzz.token_set_ratio(ne, n) >= 90:
            return True
    return False


def apply_org_entity_guard(data: dict, org_entities_raw: str | None) -> tuple[dict, bool]:
    """Return (possibly-corrected data, corrected?).

    If the vendor matches an org entity but the signing entity does not, swap the
    two parties and their signing authorities.
    """
    entities = parse_entities(org_entities_raw)
    if not entities:
        return data, False

    vendor_is_org = matches_org_entity(data.get("vendor"), entities)
    signing_is_org = matches_org_entity(data.get("signing_entity"), entities)

    if vendor_is_org and not signing_is_org:
        corrected = dict(data)
        corrected["vendor"], corrected["signing_entity"] = (
            data.get("signing_entity"),
            data.get("vendor"),
        )
        # Keep the signing authorities aligned with their (now swapped) parties
        corrected["vendor_signing_authority"], corrected["iks_signing_authority"] = (
            data.get("iks_signing_authority"),
            data.get("vendor_signing_authority"),
        )
        return corrected, True
    return data, False
