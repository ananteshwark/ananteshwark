"""Curated top-N clause versions with AI-polished, author-editable wording.

For each clause type the library keeps the N most-used versions marked as
"curated" and, for each, an AI-enhanced `polished_text` that an author can edit.
The polish step uses the configured model when available and a deterministic
clean-up otherwise, so it works on an air-gapped deployment too. Running the
curation with no clause_type backfills the entire existing library.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..models import ClauseLibraryEntry

TOP_N = 5


def polish_text(db: Session, text: str, clause_type: str, use_ai: bool | None = None) -> str:
    """Return an enhanced, professional rewrite of a clause that preserves meaning."""
    from .ai_client import AIUnavailable, ai_enabled, llm_text
    src = (text or "").strip()
    if not src:
        return src
    want_ai = ai_enabled(db) if use_ai is None else bool(use_ai)
    if want_ai:
        from .prompts import render, system_for
        prompt = render(db, "clause_polish", {"clause_type": clause_type, "clause": src[:4000]})
        try:
            out = llm_text(db, prompt, system=system_for("clause_polish"), max_tokens=800).strip()
            if out:
                return out
        except AIUnavailable:
            pass
    return _tidy(src)


def _tidy(text: str) -> str:
    """Deterministic clean-up: collapse whitespace, capitalize, ensure end punctuation."""
    out = re.sub(r"[ \t]+", " ", text.strip())
    out = re.sub(r"\s+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    if out and out[0].islower():
        out = out[0].upper() + out[1:]
    if out and out[-1] not in ".!?:;":
        out += "."
    return out


def curate_library(
    db: Session, clause_type: str | None = None, top_n: int = TOP_N,
    use_ai: bool | None = None, refresh: bool = False, compact: bool = True,
    polish: bool = True,
) -> dict:
    """Keep only the top-`top_n` most-used versions per clause type: mark them
    curated, (re)generate their polished text, and — when `compact` is set —
    retire every other version so the library holds at most `top_n` per clause.

    Retiring is a soft-delete (``deleted_at``): the version disappears from the
    library and from insertion, but its row and usage history are preserved.
    Returns summary counts. Does not commit."""
    from datetime import datetime, timezone
    entries_q = db.query(ClauseLibraryEntry).filter(ClauseLibraryEntry.deleted_at.is_(None))
    if clause_type:
        entries_q = entries_q.filter(ClauseLibraryEntry.clause_type == clause_type)
    entries = entries_q.all()

    n_entries = n_curated = n_polished = n_retired = 0
    now = datetime.now(timezone.utc)
    for entry in entries:
        active = [v for v in entry.versions if v.deleted_at is None]
        if not active:
            continue
        n_entries += 1
        ranked = sorted(active, key=lambda v: (-(v.usage_count or 0), v.id))
        top = ranked[:top_n]
        top_ids = {v.id for v in top}
        for v in active:
            if v.id in top_ids:
                continue
            if compact:
                # Retire the surplus version so only top_n remain per clause.
                v.deleted_at = now
                v.is_curated = False
                v.curated_rank = None
                n_retired += 1
            elif v.is_curated or v.curated_rank is not None:
                v.is_curated = False
                v.curated_rank = None
        for rank, v in enumerate(top, 1):
            v.is_curated = True
            v.curated_rank = rank
            n_curated += 1
            if polish and (refresh or not v.polished_text):
                v.polished_text = polish_text(db, v.text, entry.clause_type, use_ai=use_ai)
                n_polished += 1
    return {"entries": n_entries, "curated": n_curated, "polished": n_polished, "retired": n_retired}
