"""Intake copilot (H3).

A contract request arrives as a sentence from someone in the business ("we need
an NDA with Globex before the pilot in March"). Today they retype that into a
form. The copilot reads it, classifies the contract type, picks the template,
pulls out the counterparty, value and dates, and hands back a pre-filled request
for the requester to confirm.

Deterministic by default so it works air-gapped; the model refines the guess
when one is configured.
"""
from __future__ import annotations

import re
from datetime import date

from .legal_lexicon import normalize

# Type hints keyed by the words people actually use when asking.
_TYPE_HINTS: list[tuple[str, list[str]]] = [
    ("NDA", ["nda", "non-disclosure", "nondisclosure", "confidentiality agreement", "cda"]),
    ("MSA", ["msa", "master service", "master services", "framework agreement"]),
    ("SOW", ["sow", "statement of work", "work order", "project order"]),
    ("DPA", ["dpa", "data processing", "data protection agreement", "gdpr agreement"]),
    ("BAA", ["baa", "business associate"]),
    ("License", ["licence", "license", "software licence", "subscription agreement"]),
    ("Consulting", ["consulting", "consultancy", "advisory", "professional services"]),
    ("Lease", ["lease", "tenancy", "rental agreement"]),
    ("Purchase", ["purchase order", "purchase agreement", "supply agreement", "procurement"]),
]

_PRIORITY_HINTS = [
    ("high", ["urgent", "asap", "critical", "immediately", "expedite", "rush"]),
    ("low", ["whenever", "no rush", "low priority", "eventually"]),
]

_CURRENCY = {"₹": "INR", "rs": "INR", "inr": "INR", "$": "USD", "usd": "USD",
             "€": "EUR", "eur": "EUR", "£": "GBP", "gbp": "GBP"}

_MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], start=1)}


def _guess_type(text: str) -> str | None:
    low = normalize(text)
    for ctype, hints in _TYPE_HINTS:
        for h in hints:
            if re.search(rf"\b{re.escape(h)}\b", low):
                return ctype
    return None


def _guess_priority(text: str) -> str:
    low = normalize(text)
    for level, hints in _PRIORITY_HINTS:
        if any(h in low for h in hints):
            return level
    return "normal"


def _guess_counterparty(text: str) -> str | None:
    """Proper-noun run after a relationship preposition — "with Globex Health"."""
    m = re.search(r"\b(?:with|for|from|to)\s+((?:[A-Z][\w&.\-]*(?:\s+|$)){1,4})", text)
    if not m:
        return None
    name = m.group(1).strip(" .,")
    # Drop trailing lowercase-ish noise and single stopwords.
    if len(name) < 2 or name.lower() in {"the", "us", "them", "our", "their"}:
        return None
    return name


def _guess_value(text: str) -> tuple[float | None, str | None]:
    m = re.search(r"([₹$€£]|\b(?:rs|inr|usd|eur|gbp)\b)?\s*([\d,]+(?:\.\d+)?)\s*"
                  r"(k|lakh|lakhs|crore|crores|m|mn|million)?", text, re.I)
    if not m:
        return None, None
    sym, num, scale = m.group(1), m.group(2), (m.group(3) or "").lower()
    try:
        value = float(num.replace(",", ""))
    except ValueError:
        return None, None
    if value == 0:
        return None, None
    factor = {"k": 1e3, "lakh": 1e5, "lakhs": 1e5, "crore": 1e7, "crores": 1e7,
              "m": 1e6, "mn": 1e6, "million": 1e6}.get(scale, 1)
    currency = _CURRENCY.get((sym or "").lower().strip()) if sym else None
    # A bare small number is more likely a count than a contract value.
    if not sym and not scale and value < 1000:
        return None, None
    return value * factor, currency


def _guess_date(text: str) -> date | None:
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    # Scan every "<preposition> <word>" candidate, not just the first — "before
    # the pilot in March" puts a non-month word directly after the preposition.
    for m in re.finditer(r"\b(?:by|before|on|in|during)\s+(?:the\s+)?([A-Za-z]+)"
                         r"\s*(\d{1,2})?(?:,?\s*(\d{4}))?", text):
        name = m.group(1).lower()
        if name not in _MONTHS:
            continue
        month = _MONTHS[name]
        year = int(m.group(3)) if m.group(3) else date.today().year
        day = int(m.group(2)) if m.group(2) else 1
        try:
            candidate = date(year, month, min(day, 28))
        except ValueError:
            continue
        # "in March" said in April means next March.
        if not m.group(3) and candidate < date.today():
            candidate = candidate.replace(year=year + 1)
        return candidate
    # Bare month name anywhere ("March deadline").
    for m in re.finditer(r"\b([A-Za-z]+)\b", text):
        name = m.group(1).lower()
        if name in _MONTHS:
            year = date.today().year
            candidate = date(year, _MONTHS[name], 1)
            if candidate < date.today():
                candidate = candidate.replace(year=year + 1)
            return candidate
    return None


def _pick_template(db, contract_type: str | None):
    if not contract_type:
        return None
    from ..models import ContractTemplate
    return (
        db.query(ContractTemplate)
        .filter(ContractTemplate.contract_type == contract_type,
                ContractTemplate.is_active.is_(True),
                ContractTemplate.deleted_at.is_(None))
        .order_by(ContractTemplate.id.desc())
        .first()
    )


def interpret(db, text: str) -> dict:
    """Turn a free-text ask into a pre-filled contract request."""
    raw = (text or "").strip()
    if not raw:
        return {"understood": False, "fields": {}, "confidence": 0.0}

    ctype = _guess_type(raw)
    value, currency = _guess_value(raw)
    needed_by = _guess_date(raw)
    counterparty = _guess_counterparty(raw)

    fields = {
        "title": raw[:120],
        "contract_type": ctype,
        "counterparty_name": counterparty,
        "estimated_value": value,
        "currency": currency or "INR",
        "needed_by": needed_by.isoformat() if needed_by else None,
        "priority": _guess_priority(raw),
        "description": raw,
    }

    # Refine with the model when available — it only overwrites fields the
    # deterministic pass could not fill, so a confident regex is never lost.
    from .ai_client import AIUnavailable, ai_enabled, llm_json
    ai_used = False
    if ai_enabled(db):
        prompt = (
            "Extract a contract request from this message. Return STRICT JSON with "
            "keys: contract_type, counterparty_name, estimated_value (number or null), "
            "currency, needed_by (YYYY-MM-DD or null), priority (low|normal|high), "
            "title (short).\n\n"
            f"MESSAGE: {raw}"
        )
        try:
            data = llm_json(db, prompt, system="Reply with JSON only.")
            if isinstance(data, dict):
                ai_used = True
                for k in ("contract_type", "counterparty_name", "estimated_value",
                          "currency", "needed_by", "priority", "title"):
                    if fields.get(k) in (None, "", "INR", "normal") and data.get(k):
                        fields[k] = data[k]
        except AIUnavailable:
            pass

    template = _pick_template(db, fields.get("contract_type"))
    filled = sum(1 for k in ("contract_type", "counterparty_name", "estimated_value",
                             "needed_by") if fields.get(k))
    return {
        "understood": bool(fields.get("contract_type") or fields.get("counterparty_name")),
        "fields": fields,
        "template": ({"id": template.id, "name": template.name} if template else None),
        "confidence": round(filled / 4, 2),
        "ai": ai_used,
    }
