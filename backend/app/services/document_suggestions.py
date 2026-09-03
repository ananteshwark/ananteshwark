"""Field suggestions read out of the document itself.

The validation screen already suggested values learned from a vendor's validated
history. That helps for fields that repeat across a vendor's contracts, and says
nothing about the document actually on screen — the validator still had to find
the PO number, the term dates and the payment terms by reading it.

These suggestions come from the contract text, and every one carries the
sentence it was taken from, so the validator checks a quote rather than trusting
a value. Where the two sources disagree, both are offered: history knows what
this vendor usually agrees, the document knows what *this* contract says, and
which one is right is a judgement for the person validating.

Deliberately conservative: a field is suggested only where the wording is
unambiguous. A wrong value that looks authoritative costs more than a blank.
"""
from __future__ import annotations

import re
from datetime import date

# Ordered so the most specific label wins when several appear in one document.
_DATE_CUES_START = [
    "effective date", "commencement date", "commences on", "effective as of",
    "effective from", "shall commence", "start date", "with effect from",
]
_DATE_CUES_END = [
    "expiry date", "expiration date", "expires on", "expiring on", "until",
    "shall expire", "end date", "terminates on", "valid through",
]

_PO = re.compile(
    r"\b(?:purchase\s+order|p\.?\s?o\.?)\s*(?:no\.?|number|#|:)?\s*([A-Z0-9][A-Z0-9/-]{3,24})",
    re.I)

_CURRENCY_WORDS = {
    "inr": "INR", "rs": "INR", "rupees": "INR", "₹": "INR",
    "usd": "USD", "$": "USD", "dollars": "USD",
    "eur": "EUR", "€": "EUR", "euros": "EUR",
    "gbp": "GBP", "£": "GBP", "pounds": "GBP",
}
_AMOUNT = re.compile(
    r"(?P<cur>INR|USD|EUR|GBP|Rs\.?|₹|\$|€|£)\s*(?P<amt>\d[\d,]{2,}(?:\.\d{1,2})?)", re.I)

# Contract types worth naming from a title line.
_TYPES = [
    ("master services agreement", "MSA"), ("master service agreement", "MSA"),
    ("statement of work", "SOW"), ("non-disclosure agreement", "NDA"),
    ("nondisclosure agreement", "NDA"), ("confidentiality agreement", "NDA"),
    ("service agreement", "Service Agreement"), ("purchase agreement", "Purchase Agreement"),
    ("amendment", "Amendment"), ("addendum", "Amendment"),
]

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], start=1)}
_MONTHS.update({m[:3]: i for m, i in list(_MONTHS.items())})

_DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b"),                       # 01/04/2026
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),                                 # 2026-04-01
    re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b"),                   # 1 April 2026
    re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b"),                 # April 1, 2026
]


def _sentence_around(text: str, pos: int, width: int = 220) -> str:
    """The sentence containing `pos`, as the evidence quote."""
    start = max(0, pos - width)
    end = min(len(text), pos + width)
    window = text[start:end]
    left = max(window.rfind(". ", 0, pos - start), window.rfind("\n", 0, pos - start))
    right = window.find(". ", pos - start)
    if right < 0:
        right = window.find("\n", pos - start)
    quote = window[(left + 1 if left >= 0 else 0):(right + 1 if right >= 0 else len(window))]
    return " ".join(quote.split()).strip()


def _parse_date_match(m: re.Match) -> date | None:
    g = m.groups()
    try:
        if m.re.pattern.startswith(r"\b(\d{4})"):
            return date(int(g[0]), int(g[1]), int(g[2]))
        if g[1].isdigit():                                   # d/m/Y
            return date(int(g[2]), int(g[1]), int(g[0]))
        if g[0].isdigit():                                   # 1 April 2026
            mo = _MONTHS.get(g[1].lower()[:9]) or _MONTHS.get(g[1].lower()[:3])
            return date(int(g[2]), mo, int(g[0])) if mo else None
        mo = _MONTHS.get(g[0].lower()[:9]) or _MONTHS.get(g[0].lower()[:3])     # April 1, 2026
        return date(int(g[2]), mo, int(g[1])) if mo else None
    except (ValueError, TypeError, IndexError):
        return None


def _dates_with_positions(text: str) -> list[tuple[date, int]]:
    found: list[tuple[date, int]] = []
    for pat in _DATE_PATTERNS:
        for m in pat.finditer(text):
            d = _parse_date_match(m)
            if d and 1990 <= d.year <= 2100:
                found.append((d, m.start()))
    return sorted(found, key=lambda t: t[1])


def _nearest_date_after_cue(text: str, cues: list[str]) -> tuple[date, int] | None:
    """The first date following any of these cue phrases."""
    low = text.lower()
    dates = _dates_with_positions(text)
    best: tuple[int, date, int] | None = None            # (distance, date, position)
    for cue in cues:
        at = low.find(cue)
        while at >= 0:
            for d, pos in dates:
                if pos >= at and (best is None or pos - at < best[0]):
                    best = (pos - at, d, pos)
                    break
            at = low.find(cue, at + 1)
    return (best[1], best[2]) if best else None


def _suggest(out: list[dict], field: str, label: str, value, text: str, pos: int) -> None:
    if value in (None, ""):
        return
    out.append({
        "field": field,
        "label": label,
        "suggested": value.isoformat() if isinstance(value, date) else value,
        "source": "document",
        "evidence": _sentence_around(text, pos),
    })


def suggest_from_document(text: str, *, signing_entities: list[str] | None = None) -> list[dict]:
    """Field values readable from the contract text, each with its quote."""
    text = text or ""
    if not text.strip():
        return []
    out: list[dict] = []
    low = text.lower()

    # Signing entity: which of the configured internal entities the paper names.
    # Matching against the known list rather than guessing a party from the text
    # keeps this to a choice the register already accepts.
    for name in signing_entities or []:
        at = low.find((name or "").lower())
        if name and at >= 0:
            _suggest(out, "signing_entity", "Signing Entity", name, text, at)
            break

    m = _PO.search(text)
    if m:
        _suggest(out, "po_number", "PO Number", m.group(1).strip(" .,;"), text, m.start())

    start = _nearest_date_after_cue(text, _DATE_CUES_START)
    if start:
        _suggest(out, "start_date", "Start Date", start[0], text, start[1])
    end = _nearest_date_after_cue(text, _DATE_CUES_END)
    if end and (not start or end[0] > start[0]):
        _suggest(out, "end_date", "End Date", end[0], text, end[1])

    m = _AMOUNT.search(text)
    if m:
        raw = m.group("amt").replace(",", "")
        try:
            _suggest(out, "contract_value", "Contract Value", float(raw), text, m.start())
        except ValueError:
            pass
        cur = _CURRENCY_WORDS.get(m.group("cur").lower().rstrip("."))
        if cur:
            _suggest(out, "currency", "Currency", cur, text, m.start())

    for phrase, label in _TYPES:
        at = low.find(phrase)
        if at >= 0:
            _suggest(out, "contract_type", "Contract Type", label, text, at)
            break

    # Payment and notice come from the clause extractor, which already reads
    # these and keeps the sentence it read them from.
    from .clause_attributes import extract_attributes
    attrs = extract_attributes(text)
    pay = attrs.get("payment_days")
    if pay and pay.get("value"):
        at = low.find((pay.get("evidence") or "").strip().lower()[:40])
        out.append({"field": "payment_term", "label": "Payment Term",
                    "suggested": f"Net {int(pay['value'])} days", "source": "document",
                    "evidence": " ".join((pay.get("evidence") or "").split())[:220]})
    notice = attrs.get("notice_days")
    if notice and notice.get("value"):
        out.append({"field": "notice_period", "label": "Notice Period",
                    "suggested": f"{int(notice['value'])} days", "source": "document",
                    "evidence": " ".join((notice.get("evidence") or "").split())[:220]})

    return out
