"""Cross-references and defined terms for an authored document.

Scans the document for:
  * Defined terms — Title-Case phrases introduced in quotes or by "means"
    (e.g. `("Confidential Information")`, `"Agreement" means ...`).
  * Cross-references — Section/Clause/Article/Schedule/Exhibit/Annexure N.

and flags likely problems: a cross-reference to a section number that does not
exist, and a defined term that is never used after its definition. Everything is
deterministic and text-based, so it runs offline.
"""
from __future__ import annotations

import re

_REF_KINDS = "Section|Clause|Article|Schedule|Exhibit|Annexure|Appendix|Paragraph"
_REF_RE = re.compile(rf"\b({_REF_KINDS})\s+(\d+(?:\.\d+)*)", re.IGNORECASE)
# A defined term in quotes: straight or curly quotes, Title-Case, up to ~6 words.
_QUOTED_TERM_RE = re.compile(r"[\"“”]([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})[\"“”]")
_MEANS_RE = re.compile(r"\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})\s+(?:means|shall mean)\b")


def _section_numbers(document: dict | None) -> set[str]:
    """Top-level section numbers present as headings (from the renumber step)."""
    nums: set[str] = set()
    for block in (document or {}).get("content", []) or []:
        if block.get("type") != "heading":
            continue
        text = "".join(i.get("text", "") for i in (block.get("content") or []) if i.get("type") == "text")
        m = re.match(r"\s*(\d+)[.)]?\s", text)
        if m:
            nums.add(m.group(1))
    return nums


def analyze(document: dict | None, text: str) -> dict:
    body = text or ""

    # Defined terms
    defined: dict[str, int] = {}
    for m in _QUOTED_TERM_RE.finditer(body):
        defined.setdefault(m.group(1), 0)
    for m in _MEANS_RE.finditer(body):
        defined.setdefault(m.group(1), 0)
    # Count total occurrences of each term (definition + uses) in the plain text.
    defined_terms = []
    for term in sorted(defined):
        uses = len(re.findall(r"\b" + re.escape(term) + r"\b", body))
        defined_terms.append({"term": term, "occurrences": uses,
                              "unused": uses <= 1})

    # Cross-references
    section_nums = _section_numbers(document)
    refs: dict[str, dict] = {}
    for m in _REF_RE.finditer(body):
        kind = m.group(1).title()
        num = m.group(2)
        key = f"{kind} {num}"
        entry = refs.setdefault(key, {"kind": kind, "number": num, "count": 0, "dangling": False})
        entry["count"] += 1
        # Only "Section N" is validated against the document's own headings.
        if kind == "Section" and section_nums:
            entry["dangling"] = num.split(".")[0] not in section_nums
    cross_refs = [refs[k] for k in sorted(refs)]

    issues = []
    for r in cross_refs:
        if r["dangling"]:
            issues.append(f"Cross-reference to {r['kind']} {r['number']} has no matching section.")
    for t in defined_terms:
        if t["unused"]:
            issues.append(f'Defined term "{t["term"]}" is never used after its definition.')

    return {"defined_terms": defined_terms, "cross_refs": cross_refs, "issues": issues}
