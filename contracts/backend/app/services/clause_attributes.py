"""Structured clause attributes (J1).

"Show me every contract with uncapped liability" should be a filter, not a
search. That needs the *value* of a clause, not just its text: the liability cap
as a number and basis, the notice period in days, whether the term auto-renews.

Extraction is deterministic and pattern-based so it works air-gapped, and each
attribute keeps the sentence it came from so a human can check it — an
unverifiable number in a compliance filter is worse than no number.
"""
from __future__ import annotations

import re

from .clauses import segment_text
from .legal_lexicon import concepts_in, normalize

# Attribute -> (concept it belongs to, human label)
ATTRIBUTES: dict[str, tuple[str, str]] = {
    "liability_cap_basis": ("liability_cap", "Liability cap basis"),
    "liability_capped": ("liability_cap", "Liability capped"),
    "liability_cap_months": ("liability_cap", "Liability cap (months of fees)"),
    "liability_cap_amount": ("liability_cap", "Liability cap (amount)"),
    "notice_days": ("termination", "Notice period (days)"),
    "auto_renews": ("renewal", "Auto-renews"),
    "payment_days": ("payment", "Payment terms (days)"),
    "uptime_pct": ("service_levels", "Uptime commitment (%)"),
    "indemnity_direction": ("indemnity", "Indemnity runs"),
    "governing_law": ("governing_law", "Governing law"),
}

_UNCAPPED = re.compile(
    r"\b(?:unlimited|uncapped|without\s+(?:any\s+)?limit|no\s+limit(?:ation)?\s+on|"
    r"in\s+no\s+event\s+shall\s+.{0,40}\bbe\s+limited)\b", re.I)
# Word-numbers normalize to digits but leave a duplicate behind ("twelve (12)"
# becomes "12 12"), and the wording between the cap trigger and the number
# varies a lot, so allow a bounded gap and an optional repeated figure.
_CAP_MONTHS = re.compile(
    r"(?:exceed|capped\s+at|limited\s+to|equal\s+to)[^.]{0,60}?"
    r"(\d{1,3})\s*(?:\(?\d{1,3}\)?\s*)?month", re.I)
_CAP_AMOUNT = re.compile(
    r"(?:exceed|capped\s+at|limited\s+to)\s*(?:the\s+sum\s+of\s*)?"
    r"([₹$€£]|\b(?:rs|inr|usd|eur|gbp)\b)?\s*([\d,]{4,})", re.I)
_NOTICE_DAYS = re.compile(r"(\d{1,3})\s*(?:\(\w+\)\s*)?days?[^.]{0,40}\bnotice", re.I)
_NOTICE_DAYS_ALT = re.compile(r"notice[^.]{0,40}?(\d{1,3})\s*(?:\(\w+\)\s*)?days?", re.I)
_MONTHS_NOTICE = re.compile(r"(\d{1,2})\s*(?:\(\w+\)\s*)?months?[^.]{0,30}\bnotice", re.I)
_AUTO_RENEW = re.compile(r"\b(?:auto(?:matically)?[\s-]*renew|evergreen|shall\s+renew\s+"
                         r"(?:automatically|for\s+successive))\b", re.I)
_NO_AUTO_RENEW = re.compile(r"\b(?:shall\s+not\s+(?:auto(?:matically)?\s*)?renew|"
                            r"no\s+automatic\s+renewal)\b", re.I)
_PAYMENT_DAYS = re.compile(r"\bnet\s*(\d{1,3})\b|within\s+(\d{1,3})\s*(?:\(\w+\)\s*)?days?"
                           r"[^.]{0,30}(?:invoice|payment|receipt)", re.I)
_UPTIME = re.compile(r"(\d{2,3}(?:\.\d{1,2})?)\s*(?:%|percent)[^.]{0,30}"
                     r"(?:uptime|availability)|(?:uptime|availability)[^.]{0,30}?"
                     r"(\d{2,3}(?:\.\d{1,2})?)\s*(?:%|percent)", re.I)
_GOV_LAW = re.compile(r"laws?\s+of\s+(?:the\s+)?([A-Z][A-Za-z ]{2,30}?)(?:[,.;]|\s+and\b|$)")

_VENDOR_FIRST = re.compile(r"\b(vendor|supplier|provider|contractor|licensor)\b[^.]{0,60}?"
                           r"\b(?:indemnif|hold\b)", re.I)
_CUSTOMER_FIRST = re.compile(r"\b(company|customer|client|purchaser|licensee)\b[^.]{0,60}?"
                             r"\b(?:indemnif|hold\b)", re.I)


def _first_int(match: re.Match | None) -> int | None:
    if not match:
        return None
    for g in match.groups():
        if g and str(g).isdigit():
            return int(g)
    return None


def _extract_from_block(block: str) -> dict:
    """Attributes present in one clause block, each with its evidence.

    Numeric patterns run over the normalized text, because contracts write
    quantities as words ("twelve (12) months") far more often than as bare
    digits. Case-sensitive patterns keep the original text. Evidence is always
    the original wording, so a human checks what was actually written.
    """
    out: dict = {}
    present = concepts_in(block)
    norm = normalize(block)   # number words -> digits, punctuation stripped

    def put(key, value, evidence=block):
        if value is not None and key not in out:
            out[key] = {"value": value, "evidence": evidence[:300]}

    if "liability_cap" in present:
        if _UNCAPPED.search(norm) or _UNCAPPED.search(block):
            put("liability_capped", False)
            put("liability_cap_basis", "uncapped")
        else:
            months = _first_int(_CAP_MONTHS.search(norm))
            if months:
                put("liability_capped", True)
                put("liability_cap_months", months)
                put("liability_cap_basis", "months_of_fees")
            else:
                m = _CAP_AMOUNT.search(block)
                if m and m.group(2):
                    try:
                        put("liability_capped", True)
                        put("liability_cap_amount", float(m.group(2).replace(",", "")))
                        put("liability_cap_basis", "fixed_amount")
                    except ValueError:
                        pass
                elif "exceed" in norm or "capped" in norm or "limited to" in norm:
                    put("liability_capped", True)
                    put("liability_cap_basis", "capped_unspecified")

    if "termination" in present or "notice" in present:
        days = _first_int(_NOTICE_DAYS.search(norm)) or _first_int(_NOTICE_DAYS_ALT.search(norm))
        if days is None:
            months = _first_int(_MONTHS_NOTICE.search(norm))
            days = months * 30 if months else None
        put("notice_days", days)

    if "renewal" in present:
        if _NO_AUTO_RENEW.search(norm):
            put("auto_renews", False)
        elif _AUTO_RENEW.search(norm):
            put("auto_renews", True)

    if "payment" in present:
        put("payment_days", _first_int(_PAYMENT_DAYS.search(norm)))

    if "service_levels" in present:
        # Original text first: normalization strips the decimal point, which
        # would turn a 99.95% commitment into 95%.
        m = _UPTIME.search(block) or _UPTIME.search(norm)
        if m:
            val = next((g for g in m.groups() if g), None)
            if val:
                try:
                    put("uptime_pct", float(val))
                except ValueError:
                    pass

    if "indemnity" in present:
        if _VENDOR_FIRST.search(norm):
            put("indemnity_direction", "vendor_to_us")
        elif _CUSTOMER_FIRST.search(norm):
            put("indemnity_direction", "us_to_vendor")

    if "governing_law" in present:
        m = _GOV_LAW.search(block)   # capitalisation identifies the jurisdiction
        if m:
            put("governing_law", m.group(1).strip())

    return out


def extract_attributes(text: str) -> dict:
    """Structured attributes for a whole contract, merged across its clauses."""
    merged: dict = {}
    for block in segment_text(text or ""):
        for key, payload in _extract_from_block(block).items():
            if key not in merged:
                merged[key] = payload
    return merged


def matches_filter(attributes: dict, key: str, op: str, value) -> bool:
    """Evaluate one attribute filter against a contract's extracted attributes."""
    entry = (attributes or {}).get(key)
    if entry is None:
        return op == "missing"
    actual = entry.get("value")
    if op == "missing":
        return False
    if op == "exists":
        return True
    if op == "eq":
        if isinstance(actual, bool) or isinstance(value, bool):
            return bool(actual) == bool(value)
        return str(actual).lower() == str(value).lower()
    try:
        if op == "lt":
            return float(actual) < float(value)
        if op == "lte":
            return float(actual) <= float(value)
        if op == "gt":
            return float(actual) > float(value)
        if op == "gte":
            return float(actual) >= float(value)
    except (TypeError, ValueError):
        return False
    return False
