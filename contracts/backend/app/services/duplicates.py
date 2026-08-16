"""Record-level fuzzy duplicate detection (Module 4).

A candidate contract is a potential duplicate of an existing one when:
  A) same vendor (token-set ratio >= 90 ignoring corporate suffixes)
     AND same PO number, OR
  B) same vendor AND same signing entity AND overlapping start/end date range
     AND same contract service AND a compatible contract type (same type, or
     one of them unspecified).

File-level (SHA-256) duplicates are handled at ingestion time by the watcher.
"""
from dataclasses import dataclass
from datetime import date

from .vendor_matching import is_same_vendor, vendor_similarity

VENDOR_THRESHOLD = 90.0
SERVICE_THRESHOLD = 85.0


@dataclass
class ContractFacts:
    """The subset of contract fields duplicate detection needs."""
    sr_no: int | None
    vendor_name: str | None
    signing_entity: str | None
    po_number: str | None
    contract_service: str | None
    start_date: date | None
    end_date: date | None
    contract_type: str | None = None
    location: str | None = None


def _norm_po(po: str | None) -> str:
    return "".join(ch for ch in (po or "").upper() if ch.isalnum())


def dates_overlap(
    a_start: date | None, a_end: date | None, b_start: date | None, b_end: date | None
) -> bool:
    """Inclusive range-overlap check; open-ended ranges extend to +/- infinity."""
    if (a_start is None and a_end is None) or (b_start is None and b_end is None):
        return False
    a_start = a_start or date.min
    a_end = a_end or date.max
    b_start = b_start or date.min
    b_end = b_end or date.max
    return a_start <= b_end and b_start <= a_end


def _same_service(a: str | None, b: str | None) -> bool:
    from rapidfuzz import fuzz

    if not a or not b:
        return False
    return fuzz.token_set_ratio(a.lower().strip(), b.lower().strip()) >= SERVICE_THRESHOLD


def _type_compatible(a: str | None, b: str | None) -> bool:
    """Contract types are compatible when they match (case-insensitive) or at
    least one is unspecified — so differing known types rule out a duplicate,
    while a missing type never blocks the other rule signals."""
    a = (a or "").strip().lower()
    b = (b or "").strip().lower()
    if not a or not b:
        return True
    return a == b


def _location_compatible(a: str | None, b: str | None) -> bool:
    """Same rule as contract type for locations: differing known locations
    (fuzzily distinct) rule out a duplicate; a missing location never blocks."""
    from rapidfuzz import fuzz
    a = (a or "").strip().lower()
    b = (b or "").strip().lower()
    if not a or not b:
        return True
    return fuzz.token_set_ratio(a, b) >= 85


def check_pair(candidate: ContractFacts, existing: ContractFacts) -> tuple[bool, str, float]:
    """Returns (is_potential_duplicate, reason, score)."""
    sim = vendor_similarity(candidate.vendor_name, existing.vendor_name)
    if sim < VENDOR_THRESHOLD:
        return False, "", 0.0

    # Rule A: same vendor + same PO number
    po_a, po_b = _norm_po(candidate.po_number), _norm_po(existing.po_number)
    if po_a and po_a == po_b:
        return True, f"Same vendor (similarity {sim:.0f}) and same PO number {candidate.po_number}", sim

    # Rule B: same vendor + same signing entity + overlapping dates + same
    # service + compatible contract type
    if (
        candidate.signing_entity
        and existing.signing_entity
        and is_same_vendor(candidate.signing_entity, existing.signing_entity)
        and dates_overlap(
            candidate.start_date, candidate.end_date, existing.start_date, existing.end_date
        )
        and _same_service(candidate.contract_service, existing.contract_service)
        and _type_compatible(candidate.contract_type, existing.contract_type)
        and _location_compatible(candidate.location, existing.location)
    ):
        return (
            True,
            f"Same vendor (similarity {sim:.0f}), same signing entity, "
            "overlapping period, same contract service, compatible contract type and location",
            sim,
        )

    return False, "", 0.0


def find_duplicates(
    candidate: ContractFacts, existing_contracts: list[ContractFacts]
) -> list[tuple[ContractFacts, str, float]]:
    """Return every existing contract flagged as a potential duplicate."""
    hits = []
    for existing in existing_contracts:
        if existing.sr_no == candidate.sr_no:
            continue
        is_dup, reason, score = check_pair(candidate, existing)
        if is_dup:
            hits.append((existing, reason, score))
    return hits
