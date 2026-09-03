"""Repository-scale AI endpoints (G6): per-contract abstract, a rebuild-index
job, semantic search, and contract Q&A. Router mounted under /repo-ai plus a
couple of contract-scoped routes registered on the contracts router."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_validator, require_viewer
from ..database import get_db
from ..models import Contract, ContractStatus, User

router = APIRouter(prefix="/repo-ai", tags=["repo-ai"])


class AskRequest(BaseModel):
    question: str
    limit: int = 6


@router.post("/contracts/{sr_no}/summarize")
def summarize_contract(sr_no: int, db: Session = Depends(get_db),
                       user: User = Depends(require_validator)):
    """(Re)generate the AI abstract + key-terms card and refresh the embedding."""
    from ..services.contract_ai import index_contract
    c = db.get(Contract, sr_no)
    if c is None or c.deleted_at is not None:
        raise HTTPException(404, "Contract not found")
    index_contract(db, c)
    log_action(db, "contract", sr_no, "AI_SUMMARY", user_id=user.id)
    db.commit()
    return {"summary": c.ai_summary, "key_terms": c.ai_key_terms or [],
            "ai_indexed_at": c.ai_indexed_at.isoformat() if c.ai_indexed_at else None}


@router.post("/reindex")
def reindex(summarize: bool = True, limit: int = 500, db: Session = Depends(get_db),
            user: User = Depends(require_admin)):
    """Build/refresh the abstract + embedding for validated contracts that need
    it. Bounded per call (resumable) so a large repository can be indexed in
    batches. summarize=false only (re)computes embeddings."""
    from ..services.contract_ai import index_contract, stale_index_query
    # Re-index anything never indexed OR left in a previous embedding space, so
    # switching provider doesn't silently leave half the repository unfindable.
    rows = (
        stale_index_query(db)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .order_by(Contract.sr_no)
        .limit(min(limit, 1000))
        .all()
    )
    for c in rows:
        index_contract(db, c, summarize=summarize)
    db.flush()
    remaining = stale_index_query(db).filter(Contract.status == ContractStatus.VALIDATED).count()
    log_action(db, "contract", 0, "AI_REINDEX", user_id=user.id, new_value=f"{len(rows)} indexed")
    db.commit()
    return {"indexed": len(rows), "remaining": max(0, remaining)}


@router.get("/index-status")
def index_status(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Whether the search index is current — surfaced so a stale index after a
    provider change is visible instead of quietly returning nothing."""
    from ..services.contract_ai import stale_index_query
    from ..services.embeddings import active_provider, embedding_version
    total = _validated(db).count()
    stale = stale_index_query(db).filter(Contract.status == ContractStatus.VALIDATED).count()
    return {"provider": active_provider(db), "embedding_version": embedding_version(db),
            "total": total, "indexed": total - stale, "stale": stale}


def _validated(db: Session):
    return (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None))
    )


# Words too common to narrow anything down, plus the interrogatives that start a
# question but say nothing about what is being asked for.
_QUERY_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by",
    "is", "are", "was", "were", "be", "which", "what", "who", "whom", "whose",
    "when", "where", "why", "how", "do", "does", "did", "has", "have", "had",
    "any", "all", "our", "we", "us", "that", "this", "it", "its", "as", "at",
    "from", "contract", "contracts", "agreement", "agreements", "mentions",
    "mention", "show", "list", "find", "me",
}


_KEYWORD_FIELDS = ("extracted_text", "ai_summary", "contract_service",
                   "signing_entity", "po_number", "vendor_name_raw")


def _keyword_ids(db: Session, query: str, cap: int = 60) -> list[int]:
    """Contracts matching the query's significant terms, best match first.

    Matching the whole query as one substring only ever works for single-word
    searches — a question like "which contract mentions X?" matches nothing —
    so the query is split and each meaningful term searched on its own.

    The result is ordered, not a set: it feeds a reciprocal-rank fusion, which
    reads position as relevance. Returning an unordered set meant the fusion
    ranked keyword matches by primary key — the oldest contract mentioning any
    one term outranked a recent one mentioning all of them. Rows are scored on
    how many distinct terms they match (then on how often), which is the signal
    the fusion was always assuming it had.
    """
    import re
    terms = [t for t in re.findall(r"[\w%-]+", (query or "").lower())
             if len(t) > 2 and t not in _QUERY_STOP]
    if not terms:
        terms = [t for t in [(query or "").strip().lower()] if t]
    terms = terms[:8]  # bound the OR fan-out
    if not terms:
        return []

    from sqlalchemy import or_
    clauses = []
    for t in terms:
        like = f"%{t}%"
        clauses.extend([getattr(Contract, f).ilike(like) for f in _KEYWORD_FIELDS])
    # Over-fetch so the ranking has something to choose between, then cut to cap.
    rows = (_validated(db)
            .filter(or_(*clauses))
            .order_by(Contract.sr_no.desc())
            .limit(cap * 3)
            .all())

    scored = []
    for c in rows:
        hay = " ".join(str(getattr(c, f) or "") for f in _KEYWORD_FIELDS).lower()
        counts = [hay.count(t) for t in terms]
        distinct = sum(1 for n in counts if n)
        if distinct:
            scored.append((distinct, sum(counts), c.sr_no))
    scored.sort(key=lambda s: (-s[0], -s[1], -s[2]))
    return [sr for _, _, sr in scored[:cap]]


def _names_specific_contract(db: Session, query: str, max_docs: int = 3) -> bool:
    """Whether the question names a particular contract by identifier.

    Finding a contract someone asked for by reference is evidence in its own
    right, whatever the vector thinks of the sentence around it. Two conditions,
    and both are needed:

    * the term is shaped like an identifier — it carries a digit, or is written
      in caps. Rarity alone is not enough: an unusual ordinary word ("gibberish")
      can appear in one or two contracts and is not a reference to them; that
      alone let a nonsense question through.
    * it actually narrows the repository, matching at most a handful of
      contracts. A term matching a large slice is vocabulary, not a name.
    """
    import re
    from sqlalchemy import or_
    candidates = []
    for raw in re.findall(r"[\w%-]+", query or ""):
        low = raw.lower()
        if len(raw) < 3 or low in _QUERY_STOP:
            continue
        if any(ch.isdigit() for ch in raw) or (raw.isupper() and len(raw) >= 4):
            candidates.append(low)
    for t in candidates[:8]:
        like = f"%{t}%"
        n = (_validated(db)
             .filter(or_(*[getattr(Contract, f).ilike(like) for f in _KEYWORD_FIELDS]))
             .limit(max_docs + 1).count())
        if 1 <= n <= max_docs:
            return True
    return False


@router.get("/search")
def semantic_search(q: str, limit: int = 10, db: Session = Depends(get_db),
                    _: User = Depends(require_viewer)):
    """Hybrid keyword + vector search over validated contracts (G3). The two
    rankings are fused by reciprocal rank, so an exact identifier and a
    paraphrase both surface without one signal's scale swamping the other."""
    from ..services.contract_ai import hybrid_search, stale_index_query
    query = (q or "").strip()
    if not query:
        return {"results": []}
    indexed = _validated(db).filter(Contract.embedding.isnot(None)).all()
    hits = hybrid_search(db, query, limit=limit, candidates=indexed,
                         keyword_ids=_keyword_ids(db, query))
    results = [{
        "sr_no": h["contract"].sr_no, "score": h["score"],
        "vector_score": h.get("vector_score"), "keyword_hit": h.get("keyword_hit", False),
        "summary": h["contract"].ai_summary,
        "vendor_name": h["contract"].counterparty_name,
        "signing_entity": h["contract"].signing_entity,
        "contract_type": h["contract"].contract_type,
        "contract_service": h["contract"].contract_service,
    } for h in hits]
    return {"results": results, "indexed_count": len(indexed),
            "stale_index": stale_index_query(db).count()}


@router.post("/ask")
def ask_contracts(payload: AskRequest, db: Session = Depends(get_db),
                  user: User = Depends(require_viewer)):
    """Answer a natural-language question over the repository (RAG): retrieve the
    most relevant contracts, then answer with the configured model, citing the
    contracts used. With AI off, returns the retrieved passages as the answer so
    the feature still helps offline."""
    from ..services.ai_client import AIUnavailable, ai_enabled, llm_text
    from ..services.citations import annotate, verify
    from ..services.contract_ai import hybrid_search
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(400, "Ask a question")
    indexed = _validated(db).filter(Contract.embedding.isnot(None)).all()
    hits = hybrid_search(db, question, limit=min(payload.limit, 10), candidates=indexed,
                         keyword_ids=_keyword_ids(db, question))
    citations = [{
        "sr_no": h["contract"].sr_no, "score": h["score"],
        "vendor_name": h["contract"].counterparty_name,
        "summary": h["contract"].ai_summary,
    } for h in hits]

    if not hits:
        return {"answer": "No indexed contracts matched that question. Try re-indexing the repository.",
                "citations": [], "ai": False, "verified": True, "citation_report": None}

    # Exactly what the model is shown — the same text citations are checked against.
    sources = {
        h["contract"].sr_no: f"{h['contract'].ai_summary or ''}\n{(h['contract'].extracted_text or '')[:2500]}"
        for h in hits
    }

    # I4: weak retrieval means we do not have the answer — say so rather than
    # letting a model narrate confidently from unrelated documents.
    from ..services.ai_audit import record, should_abstain
    vec_scores = [h.get("vector_score") or 0.0 for h in hits]
    if should_abstain(vec_scores, query=question,
                      keyword_hit=_names_specific_contract(db, question)):
        return {"answer": "Nothing in the repository looks close enough to this question "
                          "to answer from. Try different wording, or check that the "
                          "relevant contracts are indexed.",
                "citations": citations, "ai": False, "verified": True,
                "citation_report": None, "abstained": True}

    if ai_enabled(db):
        from ..services.prompt_registry import render
        context = "\n\n".join(
            f"[Contract #{sr} — {next(h['contract'].counterparty_name or 'unknown' for h in hits if h['contract'].sr_no == sr)}]\n{text}"
            for sr, text in sources.items()
        )
        version, prompt = render(db, "ask", {"question": question, "context": context})
        try:
            with record(db, "ask", user_id=user.id, prompt_version=version,
                        inputs=question) as run:
                answer = llm_text(db, prompt,
                                  system="You are a contracts analyst. Cite sources as [#n].",
                                  max_tokens=600).strip()
                # G4: never present an unchecked citation as grounded.
                report = verify(answer, sources)
                run["ai_used"] = True
                run["output"] = answer
                run["verified"] = report["verified"]
                run["confidence"] = max(vec_scores) if vec_scores else None
            # `record` stamps the row id on exit, so read it after the block —
            # reading inside always yielded None and the UI could never attach a
            # verdict to an answer.
            run_id = run.get("id")
            log_action(db, "contract", 0, "AI_ASK", user_id=user.id, new_value=question[:200])
            db.commit()
            return {"answer": annotate(answer, report), "citations": citations, "ai": True,
                    "verified": report["verified"], "citation_report": report,
                    "run_id": run_id, "abstained": False}
        except AIUnavailable:
            pass
    # Offline fallback: hand back the most relevant summaries.
    lines = [f"[#{c['sr_no']}] {c['vendor_name'] or 'Contract'}: {c['summary'] or '(no summary)'}"
             for c in citations]
    return {"answer": "AI is not configured, so here are the most relevant contracts:\n\n" + "\n\n".join(lines),
            "citations": citations, "ai": False, "verified": True, "citation_report": None}


class ContractAsk(BaseModel):
    question: str


@router.post("/contracts/{sr_no}/ask")
def ask_one_contract(sr_no: int, payload: ContractAsk, db: Session = Depends(get_db),
                     user: User = Depends(require_viewer)):
    """Ask a question about a single contract (G5) — the document you are reading,
    rather than the whole repository."""
    from ..services.ai_client import AIUnavailable, ai_enabled, llm_text
    from ..services.citations import verify
    c = db.get(Contract, sr_no)
    if c is None or c.deleted_at is not None:
        raise HTTPException(404, "Contract not found")
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(400, "Ask a question")

    body = (c.extracted_text or "")
    if not body.strip():
        return {"answer": "This contract has no extracted text to read.", "ai": False, "verified": True}

    if ai_enabled(db):
        prompt = (
            "Answer the question using ONLY this contract. Quote the wording you "
            f"rely on. If it is not addressed, say so.\n\nQUESTION: {question}\n\n"
            f"CONTRACT #{sr_no}:\n{body[:12000]}"
        )
        try:
            answer = llm_text(db, prompt, system="You are a contracts analyst.",
                              max_tokens=500).strip()
            report = verify(answer, {sr_no: body})
            log_action(db, "contract", sr_no, "AI_ASK_ONE", user_id=user.id,
                       new_value=question[:200])
            db.commit()
            return {"answer": answer, "ai": True, "verified": report["verified"],
                    "citation_report": report}
        except AIUnavailable:
            pass
    # Offline: return the passages that best match the question.
    from ..services.embeddings import cosine, embed
    from ..services.clauses import segment_text
    qv = embed(question, db)
    blocks = segment_text(body) or [body[:1500]]
    ranked = sorted(((cosine(qv, embed(b, db)), b) for b in blocks), key=lambda t: -t[0])[:3]
    passages = [{"score": round(s, 4), "text": b[:600]} for s, b in ranked if s > 0]
    return {"answer": "AI is not configured — here are the most relevant passages from this contract.",
            "passages": passages, "ai": False, "verified": True}


class CompareRequest(BaseModel):
    sr_nos: list[int]
    attributes: list[str] | None = None


# Attributes the comparison can pull without a model — the ones already
# structured on the record. Anything else is answered from the text by the model.
_COMPARE_FIELDS = {
    "counterparty": lambda c: c.counterparty_name,
    "type": lambda c: c.contract_type,
    "value": lambda c: (f"{c.currency} {c.contract_value:,.2f}"
                        if c.contract_value is not None else None),
    "start": lambda c: c.start_date.isoformat() if c.start_date else None,
    "end": lambda c: c.end_date.isoformat() if c.end_date else None,
    "payment_term": lambda c: c.payment_term,
    "notice_period": lambda c: c.notice_period,
    "risk": lambda c: (f"{c.risk_level} ({c.risk_score})" if c.risk_level else None),
}


@router.post("/compare")
def compare_contracts(payload: CompareRequest, db: Session = Depends(get_db),
                      _: User = Depends(require_viewer)):
    """Compare several contracts side by side on chosen attributes (G5).

    Structured attributes come straight off the record. Free-text attributes
    (e.g. "liability cap") are located in each contract's text by concept match,
    so the comparison works with no model configured.
    """
    if not payload.sr_nos:
        raise HTTPException(400, "Give at least one contract number")
    rows = (
        db.query(Contract)
        .filter(Contract.sr_no.in_(payload.sr_nos[:20]), Contract.deleted_at.is_(None))
        .all()
    )
    if not rows:
        raise HTTPException(404, "No matching contracts")
    attrs = payload.attributes or ["counterparty", "type", "value", "end",
                                   "payment_term", "notice_period", "risk"]

    from ..services.clauses import segment_text
    from ..services.legal_lexicon import concepts_in

    def _text_attr(c: Contract, attr: str) -> str | None:
        """Find the passage in this contract that is about `attr`."""
        wanted = concepts_in(attr)
        best, best_hit = None, 0
        for block in segment_text(c.extracted_text or ""):
            overlap = len(wanted & concepts_in(block)) if wanted else 0
            if overlap > best_hit:
                best, best_hit = block, overlap
        return (best[:300] + "…") if best and len(best) > 300 else best

    columns = [{"key": a, "label": a.replace("_", " ").title()} for a in attrs]
    out_rows = []
    for c in rows:
        cells = {}
        for a in attrs:
            fn = _COMPARE_FIELDS.get(a)
            cells[a] = fn(c) if fn else _text_attr(c, a)
        out_rows.append({"sr_no": c.sr_no,
                         "vendor_name": c.counterparty_name,
                         "cells": cells})
    return {"columns": columns, "rows": out_rows}
