"""Auto-redline against the playbook (H1).

Phases B and G taught the system to *find* off-playbook language. This turns
that into the edit itself: for every clause sitting at walk-away or off-playbook,
propose the standard (or best fallback) wording as a real tracked change the
author can accept or reject individually.

Nothing is applied automatically — a proposal is a PENDING TrackedChange, which
is exactly what a vendor redline is, so it flows through the review UI, the
disposition ledger and the .docx round-trip already built.
"""
from __future__ import annotations

import logging

from ..models import ChangeType, Disposition, TrackedChange
from .clauses import segment_text
from .legal_lexicon import concepts_in
from .playbook import _classify_block, _playbook_entries, _TIERS

log = logging.getLogger(__name__)

# Only these positions are worth rewriting; a clause already on standard or an
# acceptable fallback is left alone.
_REWRITE_POSITIONS = {"off_playbook", "walkaway"}

AUTHOR_LABEL = "playbook@auto-redline"


def _preferred_text(tiers: dict) -> tuple[str | None, str | None]:
    """The wording to propose: standard if Legal set one, else the best fallback.
    Returns (text, tier_used)."""
    for tier in _TIERS:
        versions = [v for v in tiers.get(tier, []) if (v.polished_text or v.text)]
        if versions:
            # Most-used version of that tier reads as the house wording.
            versions.sort(key=lambda v: -(v.usage_count or 0))
            best = versions[0]
            return (best.polished_text or best.text), tier
    return None, None


def propose_redlines(db, draft, *, replace_existing: bool = True) -> dict:
    """Generate tracked-change proposals for a draft's off-playbook clauses.

    Returns a summary plus the proposals created. Idempotent by default: prior
    undecided auto-proposals are cleared first so re-running refreshes rather
    than duplicating.
    """
    from .authoring import render_text

    playbook = _playbook_entries(db)
    if not playbook:
        return {"configured": False, "proposed": 0, "proposals": []}

    if replace_existing:
        prior = (
            db.query(TrackedChange)
            .filter(TrackedChange.draft_id == draft.id,
                    TrackedChange.author_email == AUTHOR_LABEL,
                    TrackedChange.disposition == Disposition.PENDING)
            .all()
        )
        for p in prior:
            db.delete(p)
        db.flush()

    text = render_text(draft.document, draft.fields or {})
    proposals = []

    for block in segment_text(text):
        block_concepts = concepts_in(block)
        if not block_concepts:
            continue
        # Which playbook clause type is this block about?
        for clause_type, tiers in playbook.items():
            if not (concepts_in(clause_type) & block_concepts):
                continue
            info = _classify_block(_norm(block), tiers)
            if info["position"] not in _REWRITE_POSITIONS:
                continue
            replacement, tier_used = _preferred_text(tiers)
            if not replacement or replacement.strip() == block.strip():
                continue

            rationale = (
                f"{clause_type} is {info['position'].replace('_', '-')} "
                f"(closest match {int((info.get('similarity') or 0) * 100)}%). "
                f"Proposing the {tier_used} playbook wording."
            )
            tc = TrackedChange(
                draft_id=draft.id, change_type=ChangeType.REPLACE,
                clause_type=clause_type, original_text=block, proposed_text=replacement,
                author_email=AUTHOR_LABEL, rationale=rationale,
                disposition=Disposition.PENDING,
            )
            db.add(tc)
            proposals.append({
                "clause_type": clause_type, "position": info["position"],
                "tier_used": tier_used, "rationale": rationale,
                "original_text": block[:400], "proposed_text": replacement[:400],
            })
            break  # one proposal per block

    db.flush()
    return {"configured": True, "proposed": len(proposals), "proposals": proposals}


def _norm(text: str) -> str:
    from .clauses import normalize_clause
    return normalize_clause(text)
