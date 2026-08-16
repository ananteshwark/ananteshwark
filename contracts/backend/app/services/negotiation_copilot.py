"""Negotiation copilot (H2).

When a counterparty proposes a change, three things decide the response: what
Legal's playbook allows, what this counterparty has historically accepted, and
how far the proposal actually moves from our position. All three already exist
in the system — the playbook tiers, the disposition ledger, and the deviation
scorer — so the copilot assembles them into a concrete counter-proposal with a
rationale, and drafts the reply.

Works with no model configured: the counter is drawn from the playbook tiers and
the rationale is composed from the ledger. A model, when present, only improves
the prose of the reply.
"""
from __future__ import annotations

from ..models import ContractDraft, Disposition, TrackedChange
from .legal_lexicon import concepts_in
from .playbook import _classify_block, _playbook_entries, _TIERS


def _history(db, vendor_id: int | None, clause_type: str | None) -> dict:
    """What this counterparty has asked for before on this clause type, and how
    we responded. Empty when we have no prior dealings."""
    if not vendor_id:
        return {"seen": 0, "accepted": 0, "rejected": 0, "countered": 0}
    draft_ids = [d.id for d in db.query(ContractDraft.id)
                 .filter(ContractDraft.vendor_id == vendor_id).all()]
    if not draft_ids:
        return {"seen": 0, "accepted": 0, "rejected": 0, "countered": 0}
    q = db.query(TrackedChange).filter(TrackedChange.draft_id.in_(draft_ids))
    if clause_type:
        q = q.filter(TrackedChange.clause_type == clause_type)
    rows = q.all()
    return {
        "seen": len(rows),
        "accepted": sum(1 for r in rows if r.disposition == Disposition.ACCEPTED),
        "rejected": sum(1 for r in rows if r.disposition == Disposition.REJECTED),
        "countered": sum(1 for r in rows if r.disposition == Disposition.COUNTERED),
    }


def _tier_texts(tiers: dict) -> dict[str, str]:
    out = {}
    for tier in _TIERS:
        versions = [v for v in tiers.get(tier, []) if (v.polished_text or v.text)]
        if versions:
            versions.sort(key=lambda v: -(v.usage_count or 0))
            out[tier] = versions[0].polished_text or versions[0].text
    return out


def advise(db, change: TrackedChange) -> dict:
    """Recommend a response to one counterparty-proposed change."""
    draft = db.get(ContractDraft, change.draft_id)
    proposed = change.proposed_text or ""
    clause_type = change.clause_type

    playbook = _playbook_entries(db)
    tiers = None
    if clause_type and clause_type in playbook:
        tiers = playbook[clause_type]
    else:
        # Infer the clause type from the proposed wording.
        wanted = concepts_in(proposed)
        for ctype, t in playbook.items():
            if concepts_in(ctype) & wanted:
                clause_type, tiers = ctype, t
                break

    history = _history(db, draft.vendor_id if draft else None, clause_type)

    if not tiers:
        return {
            "clause_type": clause_type, "position": None, "recommendation": "review",
            "counter_text": None, "history": history,
            "rationale": "No playbook position is defined for this clause, so this "
                         "needs a human decision rather than a rule.",
        }

    from .clauses import normalize_clause
    info = _classify_block(normalize_clause(proposed), tiers)
    position = info["position"]
    texts = _tier_texts(tiers)

    if position == "standard":
        return {"clause_type": clause_type, "position": position,
                "recommendation": "accept", "counter_text": None, "history": history,
                "rationale": "Their wording already matches our standard position."}

    if position == "fallback":
        rec, counter = "accept", None
        rationale = "Their wording sits on an approved fallback — acceptable without a counter."
        if history["seen"] and history["accepted"] == 0:
            rec, counter = "counter", texts.get("standard")
            rationale = ("Their wording is on an approved fallback, but this counterparty has "
                         f"never accepted our position across {history['seen']} prior change(s) — "
                         "worth one push to the standard wording first.")
        return {"clause_type": clause_type, "position": position, "recommendation": rec,
                "counter_text": counter, "history": history, "rationale": rationale}

    # walk-away or off-playbook: counter with the best position we can still hold
    counter = texts.get("fallback") or texts.get("standard")
    if position == "walkaway":
        rationale = ("Their wording is at our walk-away position — the last acceptable "
                     "language. Counter with the fallback to recover ground.")
    else:
        rationale = ("Their wording matches no approved position "
                     f"(closest {int((info.get('similarity') or 0) * 100)}%). "
                     "Counter with the fallback, or escalate to Legal.")
    if history["accepted"]:
        rationale += (f" This counterparty has accepted our position "
                      f"{history['accepted']} time(s) before.")
    return {"clause_type": clause_type, "position": position,
            "recommendation": "counter" if counter else "reject",
            "counter_text": counter, "history": history, "rationale": rationale}


def draft_reply(db, change: TrackedChange, advice: dict) -> str:
    """Compose the message back to the counterparty. Uses the model when one is
    configured; otherwise assembles a clear, plain reply from the advice."""
    from .ai_client import AIUnavailable, ai_enabled, llm_text

    clause = advice.get("clause_type") or "the clause"
    if ai_enabled(db):
        prompt = (
            "Draft a short, professional reply to a counterparty about one contract "
            "clause. Be courteous and specific; do not invent terms.\n\n"
            f"CLAUSE: {clause}\n"
            f"THEIR PROPOSAL: {(change.proposed_text or '')[:1200]}\n"
            f"OUR DECISION: {advice.get('recommendation')}\n"
            f"OUR REASONING: {advice.get('rationale')}\n"
            f"OUR COUNTER-WORDING: {(advice.get('counter_text') or '(none)')[:1200]}\n"
        )
        try:
            return llm_text(db, prompt, system="Reply with the message body only.",
                            max_tokens=400).strip()
        except AIUnavailable:
            pass

    rec = advice.get("recommendation")
    if rec == "accept":
        return (f"Thank you for the revised {clause}. We are content with your wording "
                f"and have accepted it. {advice.get('rationale', '')}")
    if rec == "reject":
        return (f"Thank you for the proposed {clause}. Unfortunately we are unable to "
                f"accept this wording. {advice.get('rationale', '')} We would like to "
                f"retain our existing language.")
    counter = advice.get("counter_text") or ""
    return (f"Thank you for the proposed {clause}. We are not able to accept it as "
            f"drafted. {advice.get('rationale', '')}\n\nWe would propose the following "
            f"instead:\n\n{counter}\n\nHappy to discuss if that is difficult.")
