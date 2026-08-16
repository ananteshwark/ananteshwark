"""Learn stable field values from human-validated history.

Validators are the ground truth: every VALIDATED contract is a record a person
checked and corrected. For fields that tend to repeat for a given vendor
(department, signing entity, contract type, payment terms, …) we can learn the
most common validated value and re-apply it to new contracts for the same
vendor — automatically filling blanks at extraction time and offering one-click
suggestions on the validation screen.

The learner is deliberately simple and explainable: a per-field frequency count
over the vendor's validated history, with a confidence = agreement ratio. No
opaque model, and every suggestion can be traced back to the contracts it came
from.
"""
from collections import Counter

from ..models import Contract, ContractStatus

# Fields that are typically stable across a vendor's contracts and therefore
# worth learning. Per-contract specifics (dates, PO number, value, the service
# description, line items) are intentionally excluded — they should not be
# copied from a different contract.
LEARNABLE_FIELDS = [
    "signing_entity",
    "department_id",
    "contract_type",
    "currency",
    "payment_term",
    "notice_period",
    "vendor_address",
    "iks_signing_authority",
    "vendor_signing_authority",
]

# Human-readable labels for the suggestion UI / audit trail.
FIELD_LABELS = {
    "signing_entity": "Signing Entity",
    "department_id": "Department",
    "contract_type": "Contract Type",
    "currency": "Currency",
    "payment_term": "Payment Term",
    "notice_period": "Notice Period",
    "vendor_address": "Vendor Address",
    "iks_signing_authority": "IKS Signing Authority",
    "vendor_signing_authority": "Vendor Signing Authority",
}


def _norm(value) -> str | None:
    """Normalization key used to group equal values (case-insensitive for text)."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return v.lower() if v else None
    return str(value)


def vendor_history(db, vendor_id: int | None, exclude_sr=None) -> list[Contract]:
    """Validated, non-deleted contracts for a vendor (the learning corpus)."""
    if not vendor_id:
        return []
    query = (
        db.query(Contract)
        .filter(Contract.vendor_id == vendor_id)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.deleted_at.is_(None))
    )
    if exclude_sr is not None:
        query = query.filter(Contract.sr_no != exclude_sr)
    return query.all()


def field_stats(contracts: list[Contract], field: str) -> dict | None:
    """Frequency stats for one field over a set of contracts.

    Returns None when nothing was recorded. Otherwise the modal (most common)
    value, how many contracts backed it (support), how many had any value
    (total), and confidence = support / total.
    """
    counts: Counter = Counter()
    originals: dict = {}  # norm-key -> a representative original value
    for c in contracts:
        raw = getattr(c, field, None)
        key = _norm(raw)
        if key is None:
            continue
        counts[key] += 1
        originals.setdefault(key, raw)
    if not counts:
        return None
    key, support = counts.most_common(1)[0]
    total = sum(counts.values())
    return {
        "value": originals[key],
        "support": support,
        "total": total,
        "confidence": round(support / total, 3),
        "distinct": len(counts),
    }


def suggest_for_contract(
    db, contract: Contract, min_confidence: float = 0.6, min_support: int = 2,
    include_matches: bool = False,
) -> dict[str, dict]:
    """Per-field suggestions for a contract from its vendor's validated history.

    A field is suggested when the vendor's history has a confident modal value
    (``confidence >= min_confidence`` backed by at least ``min_support``
    contracts). By default a suggestion whose value already matches the
    contract's current value is dropped (nothing to change); set
    ``include_matches`` to keep them.
    """
    history = vendor_history(db, contract.vendor_id, exclude_sr=contract.sr_no)
    if len(history) < min_support:
        return {}
    out: dict[str, dict] = {}
    for field in LEARNABLE_FIELDS:
        stats = field_stats(history, field)
        if stats is None:
            continue
        if stats["support"] < min_support or stats["confidence"] < min_confidence:
            continue
        current = getattr(contract, field, None)
        matches = _norm(current) == _norm(stats["value"])
        if matches and not include_matches:
            continue
        out[field] = {
            "field": field,
            "label": FIELD_LABELS.get(field, field),
            "suggested": stats["value"],
            "current": current,
            "current_empty": _norm(current) is None,
            "matches": matches,
            "confidence": stats["confidence"],
            "support": stats["support"],
            "total": stats["total"],
        }
    return out


def autofill_from_history(
    db, contract: Contract, min_confidence: float = 0.75, min_support: int = 2,
) -> list[str]:
    """Fill a contract's EMPTY learnable fields from confident history in place.

    Only blank fields are touched — an extracted value is never overwritten
    automatically. Returns the list of field names that were filled so the
    caller can record them (e.g. on ``contract.learned_fields``).
    """
    suggestions = suggest_for_contract(
        db, contract, min_confidence=min_confidence, min_support=min_support
    )
    filled: list[str] = []
    for field, s in suggestions.items():
        if not s["current_empty"]:
            continue
        setattr(contract, field, s["suggested"])
        filled.append(field)
    return filled


# ---------------------------------------------------------------------------
# Cross-contract department suggestion (AI, from all validated contracts)
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "the", "and", "for", "of", "to", "a", "an", "in", "on", "with", "services",
    "service", "agreement", "contract", "pvt", "ltd", "limited", "inc", "llp",
}


def _tokens(text: str | None) -> set[str]:
    import re
    return {
        w for w in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def suggest_department(db, contract: Contract) -> dict | None:
    """Suggest a department for a contract, learned from validated history.

    First preference is this vendor's own validated history (strongest signal).
    Failing that, it scores every validated contract by similarity — same
    signing entity / contract type, and overlap in the service description —
    and returns the department most associated with the closest matches. Every
    suggestion is explainable (basis + how many contracts backed it).
    """
    # 1) The vendor's own validated history, if it agrees on a department.
    history = vendor_history(db, contract.vendor_id, exclude_sr=contract.sr_no)
    stats = field_stats(history, "department_id")
    if stats and stats["value"] and stats["support"] >= 2 and stats["confidence"] >= 0.6:
        return {
            "department_id": stats["value"],
            "confidence": stats["confidence"],
            "support": stats["support"],
            "total": stats["total"],
            "basis": "this vendor's validated history",
        }

    # 2) Broaden to all validated contracts, scored by similarity.

    validated = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.department_id.isnot(None))
        .filter(Contract.sr_no != contract.sr_no)
        .all()
    )
    if not validated:
        return None

    my_entity = _norm(contract.signing_entity)
    my_type = _norm(contract.contract_type)
    my_tokens = _tokens(contract.contract_service) | _tokens(getattr(contract, "service_summary", None))

    scores: Counter = Counter()
    weight: Counter = Counter()  # accumulated similarity weight per department
    for c in validated:
        w = 0.0
        if my_entity and _norm(c.signing_entity) == my_entity:
            w += 3
        if my_type and _norm(c.contract_type) == my_type:
            w += 2
        if my_tokens:
            overlap = len(my_tokens & _tokens(c.contract_service))
            w += min(overlap, 3)
        if w > 0:
            scores[c.department_id] += 1
            weight[c.department_id] += w

    if not weight:
        return None
    dept_id, top_w = weight.most_common(1)[0]
    total_w = sum(weight.values())
    return {
        "department_id": dept_id,
        "confidence": round(top_w / total_w, 3) if total_w else 0.0,
        "support": scores[dept_id],
        "total": sum(scores.values()),
        "basis": "similar validated contracts",
    }
