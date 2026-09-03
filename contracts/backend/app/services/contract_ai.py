"""Repository-scale AI for contracts (G6): per-contract abstract + key-terms
card, an offline embedding for semantic search, and the retrieval that powers
"chat with contracts". Everything degrades gracefully with AI off — the summary
falls back to a deterministic template and search uses the offline hashing
embedding, so the feature works fully air-gapped.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..models import Contract
from .embeddings import cosine, embed

log = logging.getLogger(__name__)


def _fmt_date(d) -> str | None:
    return d.isoformat() if d else None


def _money(contract: Contract) -> str | None:
    if contract.contract_value is None:
        return None
    return f"{contract.currency or ''} {contract.contract_value:,.2f}".strip()


def key_terms(contract: Contract) -> list[dict]:
    """Deterministic key-terms card: the fields that matter at a glance."""
    pairs = [
        ("Counterparty", contract.counterparty_name),
        ("Internal entity", contract.signing_entity),
        ("Type", contract.contract_type),
        ("Service", contract.contract_service),
        ("Value", _money(contract)),
        ("Start", _fmt_date(contract.start_date)),
        ("End", _fmt_date(contract.end_date)),
        ("Payment", contract.payment_term),
        ("Notice", contract.notice_period),
    ]
    return [{"label": k, "value": v} for k, v in pairs if v]


def _fallback_summary(contract: Contract, terms: list[dict]) -> str:
    who = contract.counterparty_name or "the counterparty"
    kind = contract.contract_type or "agreement"
    bits = [f"This {kind} is with {who}"]
    if contract.signing_entity:
        bits[0] += f", on behalf of {contract.signing_entity}"
    if contract.contract_service:
        bits.append(f"for {contract.contract_service}")
    val = _money(contract)
    if val:
        bits.append(f"valued at {val}")
    span = None
    if contract.start_date and contract.end_date:
        span = f"running {contract.start_date.isoformat()} to {contract.end_date.isoformat()}"
    elif contract.end_date:
        span = f"expiring {contract.end_date.isoformat()}"
    if span:
        bits.append(span)
    text = ", ".join(bits) + "."
    if contract.notice_period:
        text += f" Notice period: {contract.notice_period}."
    return text


def build_summary(db, contract: Contract) -> dict:
    """Generate (and store) the abstract + key-terms card. AI-authored when a
    model is configured, deterministic otherwise."""
    from .ai_audit import record
    from .ai_client import AIUnavailable, ai_enabled, llm_text
    from .prompt_registry import render

    terms = key_terms(contract)
    summary = None
    facts = "\n".join(f"- {t['label']}: {t['value']}" for t in terms)
    body = (contract.extracted_text or "")[:8000]
    version, prompt = render(db, "summary", {"facts": facts, "body": body})

    with record(db, "summary", entity_type="contract", entity_id=contract.sr_no,
                prompt_version=version, inputs=body) as run:
        if ai_enabled(db):
            try:
                summary = llm_text(db, prompt, system="Reply with the paragraph only.",
                                   max_tokens=300).strip()
                run["ai_used"] = True
            except AIUnavailable as exc:
                # Falling back is correct; falling back without a trace is how a
                # broken API key goes unnoticed for weeks.
                summary = None
                run["error"] = str(exc)
        else:
            run["error"] = "AI enhancements are switched off or no key is configured"
        if not summary:
            summary = _fallback_summary(contract, terms)
        run["output"] = summary

    contract.ai_summary = summary
    contract.ai_key_terms = terms
    return {"summary": summary, "key_terms": terms}


def _index_text(contract: Contract) -> str:
    """Text fed to the embedding: the abstract + key facts + a slice of body."""
    parts = [contract.ai_summary or "",
             contract.contract_service or "", contract.service_summary or "",
             contract.counterparty_name or "", contract.signing_entity or "",
             contract.contract_type or "",
             (contract.extracted_text or "")[:4000]]
    return "\n".join(p for p in parts if p)


# None = not yet probed, False = this database has no usable pgvector column.
# Reset by a restart, which is when a newly installed extension would be picked up.
_PGVECTOR_AVAILABLE: bool | None = None


def _sync_pgvector(db, contract: Contract, vector: list[float]) -> None:
    """Mirror the vector into the pgvector column when that path exists (G2).

    Best-effort, but "best-effort" needs a savepoint to mean anything on
    Postgres. A failed statement there aborts the whole transaction, so
    swallowing the exception did not contain it: on a Postgres without the
    pgvector extension this raised `type "vector" does not exist`, the except
    hid it, and every subsequent statement in the request died with
    `InFailedSqlTransaction` — turning an optional index mirror into a 500 on
    re-index and on generating any abstract. SQLite has no such behaviour, so
    the whole test suite passed throughout.

    The write now runs inside a nested transaction, so a failure rolls back
    exactly that statement, and the result is remembered so a repository-wide
    re-index does not attempt thousands of doomed savepoints.
    """
    global _PGVECTOR_AVAILABLE
    if _PGVECTOR_AVAILABLE is False:
        return
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return
    from sqlalchemy import text
    literal = "[" + ",".join(f"{v:.6f}" for v in vector) + "]"
    try:
        with db.begin_nested():
            db.execute(text("UPDATE contracts SET embedding_vec = CAST(:v AS vector) "
                            "WHERE sr_no = :sr"), {"v": literal, "sr": contract.sr_no})
        _PGVECTOR_AVAILABLE = True
    except Exception:
        if _PGVECTOR_AVAILABLE is None:
            # Logged once, and at warning: this silently disables the ANN path,
            # which an operator wondering why search is slow needs to be able to see.
            log.warning("pgvector column unavailable — retrieval will use the "
                        "in-process path. Install the pgvector extension to enable it.",
                        exc_info=True)
        _PGVECTOR_AVAILABLE = False


def index_contract(db, contract: Contract, *, summarize: bool = True) -> None:
    """Compute the abstract (optional) and the embedding, marking it indexed."""
    from .embeddings import embedding_version
    if summarize:
        build_summary(db, contract)
    vector = embed(_index_text(contract), db)
    contract.embedding = vector
    contract.embedding_version = embedding_version(db)
    contract.ai_indexed_at = datetime.now(timezone.utc)
    db.flush()
    _sync_pgvector(db, contract, vector)


def stale_index_query(db):
    """Contracts whose stored vector belongs to a different embedding space than
    the one now configured — these need re-indexing before they can be found."""
    from .embeddings import embedding_version
    current = embedding_version(db)
    return (
        db.query(Contract)
        .filter(Contract.deleted_at.is_(None))
        .filter((Contract.embedding.is_(None))
                | (Contract.embedding_version.is_(None))
                | (Contract.embedding_version != current))
    )


def semantic_search(db, query: str, limit: int = 10, candidates=None) -> list[dict]:
    """Rank indexed contracts by cosine similarity to the query embedding. Only
    contracts whose vector is in the *current* embedding space participate —
    mixing spaces after a provider change silently degrades results."""
    from .embeddings import embedding_version
    current = embedding_version(db)
    qv = embed(query or "", db)
    rows = candidates
    if rows is None:
        rows = db.query(Contract).filter(Contract.embedding.isnot(None)).all()
    scored = []
    for c in rows:
        if not c.embedding or (c.embedding_version or 0) != current:
            continue
        scored.append((cosine(qv, c.embedding), c))
    scored.sort(key=lambda t: -t[0])
    return [{"contract": c, "score": round(s, 4)} for s, c in scored[:limit]]


def hybrid_search(db, query: str, limit: int = 10, candidates=None,
                  keyword_ids=None) -> list[dict]:
    """Fuse vector and keyword rankings by reciprocal rank (G3).

    The two signals fail differently: the vector misses exact identifiers and
    rare proper nouns, keyword misses paraphrase. RRF combines rankings rather
    than raw scores, so neither scale has to be calibrated against the other.

    ``keyword_ids`` must be ordered best-first — RRF reads position as
    relevance. A set is accepted for compatibility and sorted for determinism,
    but it carries no ranking, so callers should pass a ranked sequence.
    """
    from .settings_store import get_setting
    try:
        w = float(get_setting(db, "hybrid_vector_weight") or 0.6)
    except (TypeError, ValueError):
        w = 0.6
    w = min(max(w, 0.0), 1.0)
    k = 60  # standard RRF damping

    vec_hits = semantic_search(db, query, limit=max(limit * 5, 50), candidates=candidates)
    ranks: dict[int, float] = {}
    by_id: dict[int, Contract] = {}
    detail: dict[int, dict] = {}

    for i, hit in enumerate(vec_hits):
        c = hit["contract"]
        by_id[c.sr_no] = c
        ranks[c.sr_no] = ranks.get(c.sr_no, 0.0) + w / (k + i + 1)
        detail[c.sr_no] = {"vector_score": hit["score"], "vector_rank": i + 1, "keyword_hit": False}

    kw = keyword_ids or []
    kw = sorted(kw) if isinstance(kw, (set, frozenset)) else list(dict.fromkeys(kw))
    for i, sr in enumerate(kw):
        ranks[sr] = ranks.get(sr, 0.0) + (1.0 - w) / (k + i + 1)
        d = detail.setdefault(sr, {"vector_score": None, "vector_rank": None})
        d["keyword_hit"] = True

    missing = [sr for sr in ranks if sr not in by_id]
    if missing:
        for c in db.query(Contract).filter(Contract.sr_no.in_(missing)).all():
            by_id[c.sr_no] = c

    ordered = sorted(ranks.items(), key=lambda kv: -kv[1])
    chosen = [sr for sr, _ in ordered[:limit]]

    # Reserve slots for the strongest keyword hits. Reciprocal rank alone lets
    # the vector channel crowd them out: a keyword hit at rank 1 contributes
    # (1-w)/(k+1) while a semantic near-miss at vector rank 1 contributes
    # w/(k+1), so in a large repository "which contract mentions ZANTHUM-4192"
    # returned six vaguely-related contracts and not the one contract that
    # actually contains the reference. Neither channel's misses should be able
    # to erase the other's hits — that is the whole point of searching both.
    if kw and limit > 1:
        reserved = [sr for sr in kw[:max(1, limit // 3)] if sr not in chosen]
        if reserved:
            keep = chosen[:max(1, limit - len(reserved))]
            chosen = keep + [sr for sr in reserved if sr not in keep]

    out = []
    for sr in chosen[:limit]:
        c = by_id.get(sr)
        if c is None:
            continue
        out.append({"contract": c, "score": round(ranks[sr], 6), **detail.get(sr, {})})
    return out
