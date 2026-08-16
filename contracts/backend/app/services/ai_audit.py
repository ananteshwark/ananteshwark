"""AI run recording and human-verdict capture (I1), plus the confidence and
abstention rules (I4).

Every AI-backed feature records what it produced and under which model/prompt.
The value is not the log — it is the `outcome` column: whether a human accepted,
edited or rejected the output. That is the only trustworthy measure of whether
the AI is actually helping, and the thing an auditor asks for.
"""
from __future__ import annotations

import hashlib
import logging
import time
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models import AiRun

log = logging.getLogger(__name__)

# Retrieval below this similarity is too weak to answer from — say so instead of
# guessing (I4). Re-measured against the two-channel concept embedding over a
# 482-contract corpus: 25 questions, 10 off-domain and 15 contract questions.
ABSTAIN_BELOW = 0.30

# A single absolute floor cannot do this job, because the two distributions
# overlap: off-domain questions reached 0.467 while real contract questions ran
# as low as 0.247. What separates them cleanly is not the score but whether the
# question speaks the domain's language at all — 0 of the 10 off-domain
# questions produced a single concept token, including the two that scored
# highest and would have slipped past any floor set low enough to answer real
# questions. So a question carrying no contract concept has to clear a much
# higher bar, met in practice by an exact identifier match rather than by
# semantic drift.
OFF_DOMAIN_FLOOR = 0.55


def input_hash(*parts: object) -> str:
    joined = "␟".join("" if p is None else str(p) for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _model_info(db: Session) -> tuple[str | None, str | None]:
    try:
        from .ai_client import _resolve
        provider, _key, model, _base = _resolve(db)
        return provider, model
    except Exception:
        return None, None


@contextmanager
def record(db: Session, feature: str, *, entity_type: str | None = None,
           entity_id: int | None = None, user_id: int | None = None,
           prompt_version: str | None = None, inputs: object = None):
    """Wrap an AI call so the run is recorded whether it succeeds, falls back or
    fails. Yields a mutable dict the caller fills in:

        with record(db, "summary", entity_id=c.sr_no) as run:
            run["output"] = text
            run["ai_used"] = True
    """
    provider, model = _model_info(db)
    started = time.perf_counter()
    run: dict = {"output": None, "ai_used": False, "confidence": None,
                 "verified": None, "tokens_in": None, "tokens_out": None}
    try:
        yield run
    finally:
        fields = dict(
            feature=feature, entity_type=entity_type, entity_id=entity_id,
            provider=provider, model=model, prompt_version=prompt_version,
            ai_used=bool(run.get("ai_used")),
            input_hash=input_hash(inputs) if inputs is not None else None,
            output=(str(run.get("output"))[:8000] if run.get("output") is not None else None),
            tokens_in=run.get("tokens_in"), tokens_out=run.get("tokens_out"),
            latency_ms=int((time.perf_counter() - started) * 1000),
            confidence=run.get("confidence"), verified=run.get("verified"),
            user_id=user_id,
        )
        run_id = _write_run(db, fields)
        if run_id is not None:
            run["id"] = run_id


def _write_run(db: Session, fields: dict) -> int | None:
    """Persist one audit row, committed on its own.

    This used to flush into the caller's session, which meant the record shared
    that transaction's fate: when an AI call failed and the request rolled back,
    the audit row went with it — losing exactly the runs most worth auditing.
    A separate session commits the record independently, so it survives whatever
    the feature does next.

    That is only possible where the database allows a concurrent writer. SQLite
    allows exactly one, so a second connection writing while the request holds
    an open write transaction does not fail — it *waits*, for the full busy
    timeout. Measured at 5s per audit write, which turned a 100s test suite into
    950s. So under SQLite the row goes through the caller's session as before, a
    documented limitation of the development database rather than something to
    pay for on every call. Auditing must never break, or slow, the feature it
    observes.
    """
    from ..database import SessionLocal, engine
    if engine.dialect.name == "sqlite":
        return _write_via_caller(db, fields)
    try:
        side = SessionLocal()
        try:
            entry = AiRun(**fields)
            side.add(entry)
            side.commit()
            return entry.id
        finally:
            side.close()
    except Exception:
        log.warning("Independent AI-run write failed for %s; falling back to the "
                    "caller's session", fields.get("feature"))
    return _write_via_caller(db, fields)


def _write_via_caller(db: Session, fields: dict) -> int | None:
    """Last resort: the row shares the caller's transaction, so a rollback loses
    it. Still better than no record at all."""
    try:
        entry = AiRun(**fields)
        db.add(entry)
        db.flush()
        return entry.id
    except Exception:
        log.exception("Failed to record AI run for %s", fields.get("feature"))
        return None


def set_outcome(db: Session, run_id: int, outcome: str, user_id: int | None,
                note: str | None = None) -> AiRun | None:
    """Record what the human did with an AI output."""
    if outcome not in ("accepted", "rejected", "edited"):
        raise ValueError("outcome must be accepted, rejected or edited")
    entry = db.get(AiRun, run_id)
    if entry is None:
        return None
    entry.outcome = outcome
    entry.outcome_by_id = user_id
    entry.outcome_at = datetime.now(timezone.utc)
    entry.outcome_note = note
    return entry


def should_abstain(scores: list[float], *, query: str | None = None,
                   keyword_hit: bool = False) -> bool:
    """Whether retrieval is too weak to answer from (I4).

    Better to say "I don't have this" than to narrate confidently from unrelated
    documents, which is exactly what a plausible-sounding wrong answer looks like.

    Three checks, in order of how much they tell you:

    * The question named something that identifies specific contracts — a
      reference number, a counterparty. Finding it is evidence in itself, and a
      lookup by identifier has no reason to score well semantically, so this
      answers regardless of the score.
    * Nothing clears ``ABSTAIN_BELOW`` — no candidate is worth answering from.
    * The question carries no contract concept. Then this is either off-domain
      or wording the lexicon does not know, and semantic proximity alone is not
      enough — it has to clear ``OFF_DOMAIN_FLOOR``.

    The predecessor also required the top hit to stand out from the median of
    the rest, on the theory that a flat spread means nothing matched. Measured
    on a real corpus that rule was backwards: genuine questions had ratios of
    1.00–1.33 and off-domain ones 1.04–1.10, so it could not separate them and
    fired hardest on questions the repository could genuinely answer — a
    homogeneous contract set *should* return many similar scores when asked
    about indemnity. Refusing to answer looks identical to having no data, so
    that failure would have been invisible.
    """
    if keyword_hit:
        return False
    if not scores:
        return True
    ranked = sorted((s for s in scores if s is not None), reverse=True)
    if not ranked:
        return True
    best = ranked[0]
    if best < ABSTAIN_BELOW:
        return True
    if query is not None:
        from .legal_lexicon import concepts_in
        if concepts_in(query):
            return False
    return best < OFF_DOMAIN_FLOOR


def acceptance_stats(db: Session, feature: str | None = None) -> dict:
    """How often humans keep what the AI produced — the honest quality signal."""
    q = db.query(AiRun)
    if feature:
        q = q.filter(AiRun.feature == feature)
    rows = q.all()
    judged = [r for r in rows if r.outcome]
    by_feature: dict[str, dict] = {}
    for r in rows:
        f = by_feature.setdefault(r.feature, {"runs": 0, "ai_used": 0, "accepted": 0,
                                              "edited": 0, "rejected": 0, "judged": 0})
        f["runs"] += 1
        if r.ai_used:
            f["ai_used"] += 1
        if r.outcome:
            f["judged"] += 1
            f[r.outcome] = f.get(r.outcome, 0) + 1
    return {
        "total_runs": len(rows),
        "judged": len(judged),
        "acceptance_rate": (round(sum(1 for r in judged if r.outcome == "accepted") / len(judged), 3)
                            if judged else None),
        "by_feature": [{"feature": k, **v} for k, v in sorted(by_feature.items())],
    }
