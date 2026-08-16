"""Flag clauses in a contract that are not in the company's favour.

Deterministic, offline heuristic: segment the extracted text into clauses and
match known vendor-favourable / company-unfavourable patterns (the company is the
customer here). Each flagged clause comes with a plain-language reason so the
contract page can highlight it and explain why. When the AI model is enabled it
augments the deterministic findings with a short model review.
"""
from __future__ import annotations

import re

# (compiled pattern, reason) — phrasing that typically favours the vendor/supplier
# over the company (as customer).
_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bas[- ]is\b"), "Provided “as is” — warranties disclaimed"),
    (re.compile(r"disclaim(s|er|ed)?\s+all\s+warrant"), "Disclaims all warranties"),
    (re.compile(r"no\s+warrant(y|ies)\s+(of|whatsoever|are)"), "No warranty given"),
    (re.compile(r"in\s+no\s+event\s+shall\s+(the\s+)?(vendor|supplier|licensor|provider|company)\s+be\s+liable"),
     "Excludes/limits the supplier's liability"),
    (re.compile(r"(vendor|supplier|licensor|provider)('s)?\s+(total|aggregate|maximum)?\s*liability\s+"
                r"(shall\s+not\s+exceed|is\s+limited|shall\s+be\s+limited)"),
     "Caps the supplier's liability"),
    (re.compile(r"automatically\s+renew|auto[- ]renew|successive\s+(one|1|two|2)[- ]year"),
     "Auto-renewal locks in the customer"),
    (re.compile(r"non[- ]?refundable"), "Fees are non-refundable"),
    (re.compile(r"(company|customer|client)\s+shall\s+(indemnify|defend|hold\s+harmless).{0,60}"
                r"(vendor|supplier|licensor|provider)"),
     "Company indemnifies the supplier"),
    (re.compile(r"(vendor|supplier|licensor)\s+may\s+(increase|adjust|revise)\s+(the\s+)?(fees|prices|charges|rates)"),
     "Supplier may raise prices"),
    (re.compile(r"(interest|penalty).{0,30}(overdue|past\s+due|late)|late[- ]payment\s+(fee|charge|interest)"),
     "Late-payment interest/penalty"),
    (re.compile(r"payment\s+(is\s+)?(due\s+)?(in\s+advance|upfront)|prepa(y|id|yment)"),
     "Payment required in advance"),
    (re.compile(r"sole\s+discretion\s+of\s+(the\s+)?(vendor|supplier|licensor|provider)"),
     "At the supplier's sole discretion"),
    (re.compile(r"(customer|company|client)\s+shall\s+not\s+(terminate|cancel)"),
     "Restricts the company's right to terminate"),
    (re.compile(r"exclusive(ly)?\b.{0,40}(vendor|supplier|provider)"),
     "Exclusivity in the supplier's favour"),
]


def analyze_contract_risk(text: str, db=None) -> list[dict]:
    """Return flagged clauses [{clause_type, text, reasons[]}] not in the company's
    favour. `db` enables an optional AI augmentation when the model is available."""
    from .clauses import classify_clause, segment_text
    flagged: list[dict] = []
    for block in segment_text(text or ""):
        low = block.lower()
        reasons = [reason for pat, reason in _PATTERNS if pat.search(low)]
        if reasons:
            flagged.append({
                "clause_type": classify_clause(block) or "Clause",
                "text": block.strip(),
                "reasons": sorted(set(reasons)),
            })
    if db is not None:
        try:
            _ai_augment(db, text, flagged)
        except Exception:  # best-effort — deterministic result stands
            pass
    return flagged


def _ai_augment(db, text: str, flagged: list[dict]) -> None:
    """Ask the model for additional company-unfavourable clauses (best-effort)."""
    from .ai_client import AIUnavailable, ai_enabled, llm_json
    if not text or not ai_enabled(db):
        return
    seen = {f["text"][:80] for f in flagged}
    prompt = (
        "You are reviewing a contract from the CUSTOMER's (the Company's) side. "
        "List clauses that are NOT in the Company's favour (favour the supplier/vendor). "
        "Return JSON: {\"clauses\":[{\"snippet\":\"...\",\"reason\":\"...\"}]}. "
        "Keep snippets short (quote the contract). Max 8.\n\n"
        f"CONTRACT:\n{text[:6000]}"
    )
    try:
        data = llm_json(db, prompt, system="Return only JSON.", max_tokens=700) or {}
    except AIUnavailable:
        return
    for item in (data.get("clauses") or [])[:8]:
        snippet = (item.get("snippet") or "").strip()
        reason = (item.get("reason") or "").strip()
        if not snippet or snippet[:80] in seen:
            continue
        seen.add(snippet[:80])
        flagged.append({"clause_type": "Clause (AI)", "text": snippet,
                        "reasons": [reason or "Flagged by AI review"]})
