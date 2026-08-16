"""AI obligation extraction (G4): read a contract's text and pull out the
concrete, trackable obligations (payments, reports, renewal/notice deadlines,
SLAs) into the milestone register. AI-authored when a model is configured; a
deterministic keyword scan otherwise, so it works air-gapped.
"""
from __future__ import annotations

import re

from ..models import ContractMilestone

# type -> (compiled trigger, default owner). Deterministic fallback classifier.
_RULES = [
    ("payment",  re.compile(r"\b(shall pay|payment|invoice|net\s*\d+|fees? due|remit)\b", re.I), "us"),
    ("report",   re.compile(r"\b(report|deliver(?:able)?|submit|provide a|statement of)\b", re.I), "counterparty"),
    ("renewal",  re.compile(r"\b(renew|auto-?renew|renewal term|extend the term)\b", re.I), "both"),
    ("notice",   re.compile(r"\b(notice period|days'? (?:prior )?notice|terminate.{0,30}notice)\b", re.I), "both"),
    ("sla",      re.compile(r"\b(service level|sla|uptime|availability of|response time|\d{2,3}\.?\d?\s*%)\b", re.I), "counterparty"),
    ("insurance", re.compile(r"\b(insurance|shall maintain.{0,20}coverage|policy of insurance)\b", re.I), "counterparty"),
    ("audit",    re.compile(r"\b(audit|right to inspect|inspect the records)\b", re.I), "us"),
    ("compliance", re.compile(r"\b(comply with|compliance with|adhere to|in accordance with all)\b", re.I), "counterparty"),
]


def _split_sentences(text: str) -> list[str]:
    # Split on sentence terminators and newlines; keep meaningful spans.
    parts = re.split(r"(?<=[.;])\s+|\n+", text or "")
    return [p.strip() for p in parts if len(p.strip()) >= 30]


def _classify(sentence: str) -> tuple[str, str] | None:
    low = sentence.lower()
    # "shall" is the strongest obligation signal; require a rule hit OR a modal verb.
    for otype, rx, owner in _RULES:
        if rx.search(sentence):
            if "vendor shall" in low or "provider shall" in low or "supplier shall" in low:
                owner = "counterparty"
            elif "company shall" in low or "customer shall" in low or "client shall" in low:
                owner = "us"
            return otype, owner
    if re.search(r"\bshall\b", low):
        return "other", "both"
    return None


def _title_for(sentence: str, otype: str) -> str:
    s = re.sub(r"\s+", " ", sentence).strip()
    return (s[:117] + "…") if len(s) > 118 else s


def _deterministic(text: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for sent in _split_sentences(text):
        hit = _classify(sent)
        if not hit:
            continue
        otype, owner = hit
        key = sent[:80].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"title": _title_for(sent, otype), "obligation_type": otype,
                    "owner_party": owner, "frequency": None, "source_text": sent})
        if len(out) >= 40:
            break
    return out


def _ai_extract(db, contract, text: str) -> list[dict] | None:
    from .ai_client import AIUnavailable, ai_enabled, llm_json
    if not ai_enabled(db):
        return None
    prompt = (
        "Extract the concrete, trackable OBLIGATIONS from the contract text below. "
        "Return STRICT JSON: a list of objects with keys: title (short imperative), "
        "obligation_type (one of payment, report, renewal, notice, sla, insurance, "
        "audit, compliance, other), owner_party (us, counterparty, both), frequency "
        "(one_time, monthly, quarterly, annual, or null), source_text (the clause "
        "sentence). Only real obligations, no boilerplate.\n\n"
        f"CONTRACT TEXT:\n{text[:12000]}"
    )
    try:
        data = llm_json(db, prompt, system="Reply with a JSON list only.")
    except AIUnavailable:
        return None
    if isinstance(data, dict):
        data = data.get("obligations") or data.get("items") or []
    if not isinstance(data, list):
        return None
    out = []
    for o in data:
        if not isinstance(o, dict) or not (o.get("title") or "").strip():
            continue
        out.append({
            "title": (o["title"] or "").strip()[:300],
            "obligation_type": (o.get("obligation_type") or "other").strip().lower()[:60],
            "owner_party": (o.get("owner_party") or "both").strip().lower()[:20],
            "frequency": (o.get("frequency") or None),
            "source_text": (o.get("source_text") or None),
        })
    return out


def extract_obligations(db, contract, *, replace_ai: bool = True) -> dict:
    """Extract obligations into the milestone register. Removes previously
    AI-generated obligations first (so re-running refreshes rather than
    duplicates); manually added milestones are always preserved."""
    text = contract.extracted_text or ""
    if not text.strip():
        return {"created": 0, "ai": False, "obligations": []}

    from .ai_audit import record
    with record(db, "obligations", entity_type="contract", entity_id=contract.sr_no,
                inputs=text[:12000]) as run:
        items = _ai_extract(db, contract, text)
        ai_used = items is not None
        if items is None:
            items = _deterministic(text)
        run["ai_used"] = ai_used
        run["output"] = f"{len(items)} obligation(s): " + ", ".join(
            (i.get("title") or "")[:40] for i in items[:10])

    if replace_ai:
        prior = (
            db.query(ContractMilestone)
            .filter(ContractMilestone.contract_id == contract.sr_no,
                    ContractMilestone.ai_generated.is_(True),
                    ContractMilestone.deleted_at.is_(None))
            .all()
        )
        for p in prior:
            # Keep any the user already completed; only clear open AI suggestions.
            from ..models import MilestoneStatus
            if p.status == MilestoneStatus.PENDING:
                from datetime import datetime, timezone
                p.deleted_at = datetime.now(timezone.utc)

    created = []
    for it in items:
        m = ContractMilestone(
            contract_id=contract.sr_no, title=it["title"], description=None,
            obligation_type=it.get("obligation_type"), owner_party=it.get("owner_party"),
            frequency=it.get("frequency"), source_text=it.get("source_text"),
            ai_generated=True,
        )
        db.add(m)
        created.append(m)
    db.flush()
    return {"created": len(created), "ai": ai_used,
            "obligations": [{"id": m.id, "title": m.title, "obligation_type": m.obligation_type,
                             "owner_party": m.owner_party, "frequency": m.frequency,
                             "source_text": m.source_text} for m in created]}
