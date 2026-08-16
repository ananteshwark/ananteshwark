"""Contract authoring engine: structured (ProseMirror/TipTap) document model,
per-type section skeletons, merge-field binding, derived-value recompute, and
draft→register-contract mapping.

The document is a ProseMirror JSON tree. Merge fields are inline nodes of the
form {"type": "mergeField", "attrs": {"field": "<register-key>"}} that render
the bound register value — this is the substrate for the two-way binding in the
authoring workspace.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from .dates import derive_dates, normalize_tenure, tenure_from_dates

# The register fields carried on a draft (mirrors the validation form). Stored
# as a JSON blob so custom fields are allowed; mapped to Contract columns on
# finalize. `vendor`/`department` hold display names for the document; the ids
# live on the draft row for linking.
REGISTER_FIELDS = [
    "signing_entity", "vendor", "vendor_address", "start_date", "end_date",
    "contract_tenure", "department", "po_number", "contract_value", "currency",
    "iks_signing_authority", "vendor_signing_authority", "contract_service",
    "service_summary", "payment_term", "notice_period", "contract_type",
]

# Instance-specific values cleared when duplicating an existing contract.
INSTANCE_FIELDS = [
    "start_date", "end_date", "po_number", "contract_value",
    "iks_signing_authority", "vendor_signing_authority",
]

# Derived (read-only) fields recomputed from others; never edited directly.
DERIVED_FIELDS = ["contract_value_in_words", "contract_tenure_in_words"]

# Fields whose concrete value, if typed as free text, is re-tokenized into a merge
# chip when a draft is promoted to a template (3.7). Short/ambiguous values
# (currency, numbers) are excluded to avoid false replacements.
TOKENIZE_FIELDS = [
    "signing_entity", "vendor", "vendor_address", "start_date", "end_date",
    "po_number", "contract_service", "iks_signing_authority",
    "vendor_signing_authority", "payment_term", "notice_period", "location",
]


# ---------------------------------------------------------------------------
# ProseMirror document helpers
# ---------------------------------------------------------------------------

def _text(s: str) -> dict:
    return {"type": "text", "text": s}


def _merge(field: str) -> dict:
    return {"type": "mergeField", "attrs": {"field": field}}


def _para(content: list[dict]) -> dict:
    return {"type": "paragraph", "content": content}


def _heading(level: int, text: str) -> dict:
    return {"type": "heading", "attrs": {"level": level}, "content": [_text(text)]}


def _doc(content: list[dict]) -> dict:
    return {"type": "doc", "content": content}


def iter_nodes(node: dict):
    """Depth-first walk over every node in a ProseMirror document."""
    if not isinstance(node, dict):
        return
    yield node
    for child in node.get("content", []) or []:
        yield from iter_nodes(child)


def bound_fields(document: dict | None) -> set[str]:
    """Register-field keys referenced by mergeField nodes in the document."""
    out: set[str] = set()
    for n in iter_nodes(document or {}):
        if n.get("type") == "mergeField":
            f = (n.get("attrs") or {}).get("field")
            if f:
                out.add(f)
    return out


def _display(field: str, fields: dict) -> str:
    val = fields.get(field)
    if val in (None, ""):
        return f"[{field}]"
    if field == "contract_value":
        cur = fields.get("currency") or ""
        try:
            return f"{cur} {float(val):,.2f}".strip()
        except (TypeError, ValueError):
            return str(val)
    return str(val)


def _inline_text(block: dict, fields: dict) -> str:
    parts: list[str] = []
    for inline in block.get("content", []) or []:
        if inline.get("type") == "text":
            parts.append(inline.get("text", ""))
        elif inline.get("type") == "mergeField":
            parts.append(_display((inline.get("attrs") or {}).get("field", ""), fields))
    return "".join(parts)


def _retokenize_inline(inline: list[dict], replacements: list[tuple[str, str]]) -> list[dict]:
    """Split text nodes on any concrete field value, inserting a merge chip in its
    place. `replacements` is (value, field) sorted by value length descending."""
    out: list[dict] = []
    for node in inline or []:
        if node.get("type") != "text":
            out.append(node)
            continue
        remaining = [node.get("text", "")]
        # Apply each replacement across the growing list of text fragments.
        for value, field in replacements:
            nxt: list = []
            for frag in remaining:
                if isinstance(frag, dict):   # already a merge node
                    nxt.append(frag)
                    continue
                parts = frag.split(value)
                for i, part in enumerate(parts):
                    if part:
                        nxt.append(part)
                    if i < len(parts) - 1:
                        nxt.append({"type": "mergeField", "attrs": {"field": field, "value": "", "raw": ""}})
            remaining = nxt
        for frag in remaining:
            out.append({"type": "text", "text": frag} if isinstance(frag, str) else frag)
    return out


def retokenize_document(document: dict | None, fields: dict) -> dict:
    """Return a copy of the document with concrete field values (typed as free
    text) replaced by merge chips, so a promoted template is reusable (3.7)."""
    if not document:
        return document
    replacements = []
    for field in TOKENIZE_FIELDS:
        val = fields.get(field)
        if val is None:
            continue
        s = str(val).strip()
        if len(s) >= 3:
            replacements.append((s, field))
    # Longer values first so a value that contains a shorter one is matched whole.
    replacements.sort(key=lambda kv: -len(kv[0]))
    if not replacements:
        return document
    content = []
    for block in document.get("content", []) or []:
        if block.get("type") in ("paragraph", "heading") and block.get("content"):
            content.append({**block, "content": _retokenize_inline(block["content"], replacements)})
        else:
            content.append(block)
    return {**document, "content": content}


def render_text(document: dict | None, fields: dict) -> str:
    """Plain-text rendering with merge values substituted (export/search base).

    Lists are flattened with bullet/number prefixes so their content is not lost.
    """
    lines: list[str] = []

    def walk(blocks, list_kind=None, depth=0):
        counter = 0
        for block in blocks or []:
            btype = block.get("type")
            if btype in ("bulletList", "orderedList"):
                walk(block.get("content"), list_kind=btype, depth=depth + 1)
            elif btype == "table":
                # Flatten each row to " | "-separated cell text so tables survive
                # plain-text/docx export and full-text search.
                for row in block.get("content") or []:
                    cells = []
                    for cell in row.get("content") or []:
                        cell_text = " ".join(
                            _inline_text(p, fields).strip() for p in (cell.get("content") or [])
                        ).strip()
                        cells.append(cell_text)
                    line = " | ".join(cells).strip()
                    if line.strip(" |"):
                        lines.append(("  " * depth + line) if depth else line)
            elif btype == "listItem":
                counter += 1
                # Render the item's first paragraph inline with a marker; recurse the rest.
                children = block.get("content") or []
                if children:
                    marker = f"{counter}. " if list_kind == "orderedList" else "• "
                    head = _inline_text(children[0], fields).strip()
                    if head:
                        lines.append("  " * depth + marker + head)
                    walk(children[1:], depth=depth)
            else:
                text = _inline_text(block, fields).strip()
                if text:
                    lines.append(("  " * depth + text) if depth else text)

    walk((document or {}).get("content", []) or [])
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Section skeletons per contract type (admin-extensible via templates later)
# ---------------------------------------------------------------------------

# (heading, [inline content]) sections shared by most agreements.
_PARTIES = _para([
    _text("This Agreement is entered into by and between "),
    _merge("signing_entity"), _text(" (“Company”) and "),
    _merge("vendor"), _text(" (“Vendor”), located at "),
    _merge("vendor_address"), _text("."),
])
_TERM = ("Term", _para([
    _text("This Agreement commences on "), _merge("start_date"),
    _text(" and, unless terminated earlier, continues until "), _merge("end_date"),
    _text(" (tenure: "), _merge("contract_tenure"), _text(")."),
]))
_SERVICES = ("Services", _para([
    _text("The Vendor shall provide "), _merge("contract_service"), _text(". "),
    _merge("service_summary"),
]))
_PAYMENT = ("Payment Terms", _para([
    _text("The contract value is "), _merge("contract_value"),
    _text(" ("), _merge("contract_value_in_words"), _text("). Payment terms: "),
    _merge("payment_term"), _text(". Purchase order: "), _merge("po_number"), _text("."),
]))
_TERMINATION = ("Termination", _para([
    _text("Either party may terminate this Agreement by giving "),
    _merge("notice_period"), _text(" written notice to the other party."),
]))
_SIGNATURES = ("Signatures", _para([
    _text("For the Company: "), _merge("iks_signing_authority"),
    _text("    For the Vendor: "), _merge("vendor_signing_authority"),
]))

_COMMON_TAIL = [
    ("Confidentiality", _para([_text(
        "Each party shall keep confidential all non-public information disclosed "
        "under this Agreement and use it solely to perform its obligations.")])),
    ("Governing Law", _para([_text(
        "This Agreement is governed by the laws of India and the courts at the "
        "Company's registered office shall have exclusive jurisdiction.")])),
    _TERMINATION,
    ("Notices", _para([_text(
        "Notices under this Agreement shall be in writing and delivered to the "
        "addresses set out above.")])),
    _SIGNATURES,
]


def _sections(title: str, sections: list) -> dict:
    content: list[dict] = [_heading(1, title), _PARTIES]
    for i, sec in enumerate(sections, start=1):
        heading, para = sec
        content.append(_heading(2, f"{i}. {heading}"))
        content.append(para)
    return _doc(content)


# Section order per contract type; unknown types fall back to a generic set.
_SKELETONS = {
    "MSA": ("MASTER SERVICES AGREEMENT", [_TERM, _SERVICES, _PAYMENT] + _COMMON_TAIL),
    "SOW": ("STATEMENT OF WORK", [
        _TERM, _SERVICES,
        ("Deliverables & Milestones", _para([_text(
            "Deliverables, acceptance criteria and milestone dates are set out in "
            "this Statement of Work.")])),
        _PAYMENT, _SIGNATURES,
    ]),
    "NDA": ("NON-DISCLOSURE AGREEMENT", [
        _TERM,
        ("Confidential Information", _para([_text(
            "“Confidential Information” means all non-public information "
            "disclosed by one party to the other.")])),
        ("Obligations", _para([_text(
            "The receiving party shall protect Confidential Information and not "
            "disclose it to third parties.")])),
        ("Governing Law", _para([_text("This Agreement is governed by the laws of India.")])),
        _SIGNATURES,
    ]),
    "Service Agreement": ("SERVICE AGREEMENT", [_TERM, _SERVICES, _PAYMENT] + _COMMON_TAIL),
    "Purchase Agreement": ("PURCHASE AGREEMENT", [
        _TERM,
        ("Goods / Services", _para([_text("The Vendor shall supply "), _merge("contract_service"), _text(".")])),
        _PAYMENT,
        ("Delivery & Acceptance", _para([_text(
            "Delivery, inspection and acceptance terms are as set out in the "
            "purchase order referenced above.")])),
        _SIGNATURES,
    ]),
    "Amendment": ("AMENDMENT", [
        ("Background", _para([_text(
            "This Amendment modifies the agreement identified below between the "
            "parties. All other terms remain in full force.")])),
        _TERM,
        ("Amended Terms", _para([_text("The parties agree to the following amended terms:")])),
        _SIGNATURES,
    ]),
    "Renewal": ("RENEWAL AGREEMENT", [
        ("Background", _para([_text(
            "This Renewal extends the term of the agreement identified below "
            "between the parties on the terms set out herein.")])),
        _TERM, _PAYMENT, _SIGNATURES,
    ]),
}

_GENERIC = ("CONTRACT", [_TERM, _SERVICES, _PAYMENT] + _COMMON_TAIL)


def scaffold_document(contract_type: str | None) -> dict:
    """Build the standard section skeleton for a contract type."""
    title, sections = _SKELETONS.get((contract_type or "").strip(), _GENERIC)
    return _sections(title, sections)


# ---------------------------------------------------------------------------
# Derived values (recomputed automatically from the register fields)
# ---------------------------------------------------------------------------

_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight",
         "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
         "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
         "eighty", "ninety"]
_SCALE = [(10 ** 9, "billion"), (10 ** 6, "million"), (10 ** 3, "thousand"), (1, "")]


def _under_thousand(n: int) -> str:
    parts: list[str] = []
    if n >= 100:
        parts.append(_ONES[n // 100] + " hundred")
        n %= 100
    if n >= 20:
        w = _TENS[n // 10]
        if n % 10:
            w += "-" + _ONES[n % 10]
        parts.append(w)
    elif n > 0:
        parts.append(_ONES[n])
    return " ".join(parts)


def _indian_words(whole: int) -> str:
    """Indian numbering: crore (10^7) / lakh (10^5) / thousand / hundreds."""
    if whole == 0:
        return "zero"
    parts: list[str] = []
    crore = whole // 10 ** 7
    lakh = (whole // 10 ** 5) % 100
    thousand = (whole // 10 ** 3) % 100
    hundred = whole % 1000
    if crore:
        parts.append(_indian_words(crore) + " crore")   # crore group can exceed 99
    if lakh:
        parts.append(_under_thousand(lakh) + " lakh")
    if thousand:
        parts.append(_under_thousand(thousand) + " thousand")
    if hundred:
        parts.append(_under_thousand(hundred))
    return " ".join(p for p in parts if p.strip())


def _international_words(whole: int) -> str:
    if whole == 0:
        return "zero"
    chunks: list[str] = []
    for base, name in _SCALE:
        if whole >= base:
            chunk = whole // base
            whole %= base
            chunks.append((_under_thousand(chunk) + " " + name) if base > 1 else _under_thousand(chunk))
    return " ".join(c for c in chunks if c.strip())


def number_to_words(value, indian: bool = False) -> str:
    """Cardinal words for a number. With `indian=True` uses the lakh/crore system
    (e.g. 12,50,000 -> 'twelve lakh fifty thousand'), else thousand/million/billion.
    Returns '' for blank/invalid input."""
    try:
        num = float(value)
    except (TypeError, ValueError):
        return ""
    if num < 0:
        return "minus " + number_to_words(-num, indian)
    whole = int(num)
    cents = int(round((num - whole) * 100))
    words = _indian_words(whole) if indian else _international_words(whole)
    if cents:
        words += f" and {cents:02d}/100"
    return words.strip()


def _tenure_in_words(tenure: str | None) -> str:
    """'24 Months' -> 'twenty-four months'."""
    if not tenure:
        return ""
    import re
    m = re.match(r"\s*(\d+)\s*(month|year)", tenure, re.I)
    if not m:
        return tenure
    n = int(m.group(1))
    unit = m.group(2).lower() + ("s" if n != 1 else "")
    return f"{_under_thousand(n) or 'zero'} {unit}".strip()


def _parse_date(s):
    if isinstance(s, date):
        return s
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def recompute_fields(fields: dict) -> dict:
    """Recompute derived values in place: dates from tenure, value/tenure in
    words. Returns the same dict for convenience."""
    start = _parse_date(fields.get("start_date"))
    end = _parse_date(fields.get("end_date"))
    tenure = fields.get("contract_tenure")
    start, end, _derived = derive_dates(start, end, tenure)
    if start:
        fields["start_date"] = start.isoformat()
    if end:
        fields["end_date"] = end.isoformat()
    fields["contract_tenure"] = tenure_from_dates(start, end) or normalize_tenure(tenure)
    # Indian (lakh/crore) numbering for INR/Rupee amounts, international otherwise.
    cur = (fields.get("currency") or "INR").strip().upper()
    indian = cur in ("INR", "RS", "RS.", "₹", "RUPEE", "RUPEES")
    fields["contract_value_in_words"] = number_to_words(fields.get("contract_value"), indian=indian)
    fields["contract_tenure_in_words"] = _tenure_in_words(fields.get("contract_tenure"))
    return fields


# ---------------------------------------------------------------------------
# Cloning an existing register contract into a draft
# ---------------------------------------------------------------------------

def fields_from_contract(contract) -> dict:
    """Snapshot a register Contract's fields into the draft field blob."""
    def d(v):
        return v.isoformat() if isinstance(v, date) else v
    return {
        "signing_entity": contract.signing_entity,
        "vendor": (contract.vendor.name if contract.vendor else contract.vendor_name_raw),
        "vendor_address": contract.vendor_address,
        "start_date": d(contract.start_date),
        "end_date": d(contract.end_date),
        "contract_tenure": contract.contract_tenure,
        "department": (contract.department.name if contract.department else None),
        "po_number": contract.po_number,
        "contract_value": float(contract.contract_value) if contract.contract_value is not None else None,
        "currency": contract.currency or "INR",
        "iks_signing_authority": contract.iks_signing_authority,
        "vendor_signing_authority": contract.vendor_signing_authority,
        "contract_service": contract.contract_service,
        "service_summary": contract.service_summary,
        "payment_term": contract.payment_term,
        "notice_period": contract.notice_period,
        "contract_type": contract.contract_type,
    }


def clear_instance_fields(fields: dict) -> dict:
    """Blank instance-specific values (dates, PO, value, signatures) on a clone."""
    for f in INSTANCE_FIELDS:
        fields[f] = None
    return recompute_fields(fields)


def renewal_fields_from_contract(contract) -> dict:
    """Clone a contract's fields for a RENEWAL: keep the same tenure and roll the
    term forward (new start = day after the old end date, new end = start +
    tenure), clearing only one-off values (PO, value, signatures)."""
    fields = fields_from_contract(contract)
    old_end = _parse_date(fields.get("end_date"))
    if old_end:
        fields["start_date"] = (old_end + timedelta(days=1)).isoformat()
    fields["end_date"] = None  # recompute derives it from the new start + tenure
    for f in ("po_number", "contract_value", "iks_signing_authority", "vendor_signing_authority"):
        fields[f] = None
    recompute_fields(fields)
    return fields


# ---------------------------------------------------------------------------
# Rebuild an editable document from a contract's extracted text
# ---------------------------------------------------------------------------

def _looks_like_heading(line: str) -> bool:
    s = (line or "").strip()
    if not s or len(s) > 70:
        return False
    if re.match(r"^\d+(\.\d+)*[.)]\s+\S", s):                       # "1. Title", "2.1 Title"
        return True
    if re.match(r"^(SECTION|ARTICLE|CLAUSE|SCHEDULE|EXHIBIT|ANNEXURE|APPENDIX)\b", s, re.I):
        return True
    letters = [c for c in s if c.isalpha()]
    if letters and all(c.isupper() for c in letters) and len(s.split()) <= 8:  # ALL CAPS short line
        return True
    return False


def _is_bullet(line: str) -> bool:
    return bool(re.match(r"^\s*[-*•·]\s+\S", line or ""))


def document_from_text(text: str) -> dict:
    """Best-effort TipTap document from a contract's extracted text, preserving
    its heading / paragraph / bullet structure (full visual fidelity — fonts,
    bold, tables — cannot be recovered from plain text)."""
    if not text or not text.strip():
        return scaffold_document(None)
    content: list[dict] = []

    def _para_node(txt):
        return {"type": "paragraph", "content": [{"type": "text", "text": txt}]}

    def flush_para(buf):
        if not buf:
            return
        first = buf[0].strip()
        if _looks_like_heading(first):
            content.append({"type": "heading", "attrs": {"level": 2},
                            "content": [{"type": "text", "text": first}]})
            rest = " ".join(ln.strip() for ln in buf[1:])
            if rest.strip():
                content.append(_para_node(rest))
        else:
            content.append(_para_node(" ".join(ln.strip() for ln in buf)))

    def flush_bullets(buf):
        if not buf:
            return
        items = [{"type": "listItem", "content": [_para_node(re.sub(r"^\s*[-*•·]\s+", "", ln).strip())]}
                 for ln in buf]
        content.append({"type": "bulletList", "content": items})

    for raw in re.split(r"\n\s*\n", text):
        lines = [ln for ln in raw.split("\n") if ln.strip()]
        para_buf: list[str] = []
        bullet_buf: list[str] = []
        for ln in lines:
            if _is_bullet(ln):
                flush_para(para_buf); para_buf = []
                bullet_buf.append(ln)
            else:
                flush_bullets(bullet_buf); bullet_buf = []
                para_buf.append(ln)
        flush_bullets(bullet_buf)
        flush_para(para_buf)
    return {"type": "doc", "content": content or [{"type": "paragraph"}]}
