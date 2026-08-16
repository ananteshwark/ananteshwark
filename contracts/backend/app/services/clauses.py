"""Clause intelligence: segment contracts into clauses, classify by type, and
cluster near-identical texts into canonical versions with usage + metadata.

Segmentation/classification is a deterministic structure+keyword engine so it
runs offline and is fully testable; when a Claude key is configured the same
entry points can be enhanced by the model (see clause_ai). Version clustering
groups texts by normalized-text similarity — no external embedding service, so
the < 1s library search and the batch job work on the air-gapped server.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher

from ..models import (
    ClauseLibraryEntry,
    ClauseStatus,
    ClauseUsage,
    ClauseVersion,
    Contract,
    RiskPosture,
)
from .settings_store import get_setting

# Admin-extensible taxonomy (stored in the 'clause_taxonomy' setting; this is the
# default). Order matters only for display.
DEFAULT_TAXONOMY = [
    "Exit/Termination", "Indemnity", "Limitation of Liability", "Confidentiality",
    "Payment Terms", "Force Majeure", "Governing Law & Jurisdiction",
    "Dispute Resolution/Arbitration", "IP Ownership", "Data Protection/DPA",
    "Non-Solicitation", "Warranty", "Insurance", "Audit Rights", "Assignment",
    "Notices", "SLA/Service Levels", "Change Control", "Subcontracting",
    "Anti-Bribery/Compliance",
]

# Keyword signals per clause type (lower-cased substring match). First type with
# the most keyword hits wins.
_KEYWORDS: dict[str, list[str]] = {
    "Exit/Termination": ["terminat", "notice period", "for convenience", "expiry of"],
    "Indemnity": ["indemnif", "indemnity", "hold harmless", "defend"],
    "Limitation of Liability": ["limitation of liability", "liable", "liability", "shall not exceed", "cap on"],
    "Confidentiality": ["confidential", "non-disclosure", "proprietary information"],
    "Payment Terms": ["payment", "invoice", "net 30", "net 45", "fees", "shall pay"],
    "Force Majeure": ["force majeure", "act of god", "beyond the reasonable control"],
    "Governing Law & Jurisdiction": ["governing law", "jurisdiction", "governed by the laws", "courts at"],
    "Dispute Resolution/Arbitration": ["arbitration", "dispute resolution", "arbitrator", "conciliation"],
    "IP Ownership": ["intellectual property", "ownership of", "work product", "ip rights", "assigns all right"],
    "Data Protection/DPA": ["data protection", "personal data", "gdpr", "processing of data", "data processor"],
    "Non-Solicitation": ["non-solicit", "solicit", "not hire", "poach"],
    "Warranty": ["warrant", "warranty", "represents and warrants"],
    "Insurance": ["insurance", "insured", "policy of insurance", "coverage of"],
    "Audit Rights": ["audit", "inspect the records", "right to audit"],
    "Assignment": ["assign", "assignment", "transfer its rights"],
    "Notices": ["notices", "in writing", "delivered to the address", "notice shall be"],
    "SLA/Service Levels": ["service level", "sla", "uptime", "response time", "availability of"],
    "Change Control": ["change control", "change request", "change order", "scope change"],
    "Subcontracting": ["subcontract", "sub-contract", "third party provider"],
    "Anti-Bribery/Compliance": ["anti-bribery", "bribery", "corruption", "fcpa", "compliance with laws"],
}

_SIMILARITY_MATCH = 0.85   # >= this normalized-text ratio = same version


def taxonomy(db) -> list[str]:
    raw = get_setting(db, "clause_taxonomy")
    if raw and raw.strip():
        items = [t.strip() for t in raw.replace("\n", ",").split(",") if t.strip()]
        if items:
            return items
    return list(DEFAULT_TAXONOMY)


def normalize_clause(text: str) -> str:
    """Lower-case, collapse whitespace, drop leading numbering/punctuation — a
    stable key for near-duplicate detection."""
    t = (text or "").lower()
    t = re.sub(r"^\s*\d+[.)]\s*", "", t)          # leading '1.' / '2)'
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def classify_clause(text: str) -> str | None:
    """Best-matching clause type for a block of text, or None if nothing hits."""
    low = (text or "").lower()
    best, best_hits = None, 0
    for ctype, kws in _KEYWORDS.items():
        hits = sum(1 for kw in kws if kw in low)
        if hits > best_hits:
            best, best_hits = ctype, hits
    return best if best_hits > 0 else None


_HEADING_RE = re.compile(r"(?m)^\s*(?:\d+[.)]\s+|[A-Z][A-Za-z /&]{2,40}:?\s*$)")


def segment_text(text: str) -> list[str]:
    """Split a contract into candidate clause blocks. Splits on blank lines and
    numbered/heading lines, keeping blocks of a meaningful length."""
    if not text:
        return []
    # First split on blank lines; then further split very long blocks on numbering.
    raw_blocks = re.split(r"\n\s*\n", text)
    blocks: list[str] = []
    for b in raw_blocks:
        b = b.strip()
        if len(b) < 40:
            continue
        blocks.append(b)
    return blocks


def segment_and_classify(text: str) -> list[dict]:
    """Return [{clause_type, text}] for classifiable blocks in the document."""
    out: list[dict] = []
    for block in segment_text(text):
        ctype = classify_clause(block)
        if ctype:
            out.append({"clause_type": ctype, "text": block})
    return out


def summarize_version(db, version) -> str | None:
    """Plain-language summary of how this clause version differs from its
    siblings, via the configured AI model. Stores and returns it; None if AI is
    unavailable (deterministic fallback below)."""
    from .ai_client import AIUnavailable, ai_enabled, llm_text
    siblings = [s for s in version.entry.versions if s.id != version.id and s.deleted_at is None]
    if ai_enabled(db):
        from .prompts import render, system_for
        others = "\n\n".join(f"[{s.label}] {s.text[:600]}" for s in siblings[:4]) or "(no other versions)"
        prompt = render(db, "clause_summary", {
            "clause_type": version.entry.clause_type,
            "this_version": version.text[:1200], "other_versions": others,
        })
        try:
            out = llm_text(db, prompt, system=system_for("clause_summary"), max_tokens=120).strip()
            if out:
                version.summary = out
                return out
        except AIUnavailable:
            pass
    # Deterministic fallback: note distinguishing keywords.
    low = (version.text or "").lower()
    hints = []
    for kw, label in [("shall not exceed", "caps liability"), ("uncapped", "uncapped liability"),
                      ("12 month", "12-month cap"), ("indemnif", "includes indemnity"),
                      ("net 30", "Net 30 terms"), ("net 45", "Net 45 terms")]:
        if kw in low:
            hints.append(label)
    summary = ("This version " + ", ".join(hints) + ".") if hints else \
              f"{version.risk_posture.value.replace('_', ' ').lower()} wording ({len(version.text or '')} chars)."
    version.summary = summary
    return summary


def _get_entry(db, clause_type: str) -> ClauseLibraryEntry:
    entry = (
        db.query(ClauseLibraryEntry)
        .filter(ClauseLibraryEntry.clause_type == clause_type)
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
        .first()
    )
    if entry is None:
        entry = ClauseLibraryEntry(clause_type=clause_type, title=clause_type)
        db.add(entry)
        db.flush()
    return entry


def match_or_create_version(db, clause_type: str, text: str) -> tuple[ClauseVersion, bool]:
    """Find the version whose normalized text is similar enough, else create a
    new one. Returns (version, created)."""
    entry = _get_entry(db, clause_type)
    norm = normalize_clause(text)
    best, best_ratio = None, 0.0
    for v in entry.versions:
        if v.deleted_at is not None:
            continue
        r = similarity(norm, v.normalized or "")
        if r > best_ratio:
            best, best_ratio = v, r
    if best is not None and best_ratio >= _SIMILARITY_MATCH:
        return best, False
    label = f"v{len([v for v in entry.versions if v.deleted_at is None]) + 1}"
    version = ClauseVersion(
        entry_id=entry.id, label=label, text=text, normalized=norm,
        risk_posture=RiskPosture.BALANCED, status=ClauseStatus.DRAFT,
    )
    db.add(version)
    db.flush()
    return version, True


def record_usage(db, version: ClauseVersion, contract: Contract | None) -> None:
    """Attach a usage record and refresh the version's usage counters/dates."""
    eff = contract.start_date if contract else None
    usage = ClauseUsage(
        version_id=version.id,
        contract_id=contract.sr_no if contract else None,
        vendor_id=contract.vendor_id if contract else None,
        department_id=contract.department_id if contract else None,
        contract_type=contract.contract_type if contract else None,
        signing_entity=contract.signing_entity if contract else None,
        effective_date=eff,
    )
    db.add(usage)
    version.usage_count = (version.usage_count or 0) + 1
    if eff:
        if version.first_used is None or eff < version.first_used:
            version.first_used = eff
        if version.last_used is None or eff > version.last_used:
            version.last_used = eff


def ai_segment_and_classify(db, text: str) -> list[dict] | None:
    """Segment + classify a document with the configured AI model (Claude by
    default). Returns None when AI is unavailable or the reply is unusable, so
    the caller falls back to the deterministic engine."""
    from .ai_client import AIUnavailable, ai_enabled, llm_json
    if not text or not ai_enabled(db):
        return None
    taxo = taxonomy(db)
    prompt = (
        "Split the CONTRACT TEXT into its individual substantive clauses. For each clause "
        "choose the single best clause type ONLY from this taxonomy (skip a clause if none "
        "fit): " + ", ".join(taxo) + ".\n"
        "Return STRICT JSON: an array of objects {\"clause_type\": <one of the taxonomy>, "
        "\"text\": <the clause's verbatim text from the document>}. Do not invent text.\n\n"
        "CONTRACT TEXT:\n" + text[:16000]
    )
    try:
        data = llm_json(db, prompt, system="Reply with a JSON array only.", max_tokens=4000)
    except AIUnavailable:
        return None
    if not isinstance(data, list):
        return None
    valid = set(taxo)
    out: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        ct = item.get("clause_type")
        txt = (item.get("text") or "").strip()
        if ct in valid and len(txt) >= 20:
            out.append({"clause_type": ct, "text": txt})
    return out or None


def learn_from_contract(db, contract: Contract, text: str | None = None,
                        use_ai: bool = False) -> tuple[int, bool]:
    """Segment + classify a contract's text and feed the library.

    When ``use_ai`` is set, the configured AI model segments the document
    (falling back to the deterministic engine on any failure). Returns
    ``(clauses_recorded, used_ai)``.
    """
    body = text if text is not None else (contract.extracted_text or "")
    clauses = ai_segment_and_classify(db, body) if use_ai else None
    used_ai = clauses is not None
    if clauses is None:
        clauses = segment_and_classify(body)
    count = 0
    for c in clauses:
        version, _created = match_or_create_version(db, c["clause_type"], c["text"])
        record_usage(db, version, contract)
        count += 1
    return count, used_ai


# ---------------------------------------------------------------------------
# Batch learning job (admin-triggered, resumable, progress feedback)
# ---------------------------------------------------------------------------

# Simple in-process progress state for the current run.
learn_progress: dict = {
    "running": False, "total": 0, "processed": 0, "clauses": 0,
    "ai_used": 0, "ai": False, "error": None,
}


def run_learning_job(db, reset: bool = False, use_ai: bool | None = None) -> dict:
    """Iterate contracts with document text and feed the clause library. Marks
    processed contracts in the 'clause_learned_ids' setting so re-runs resume.

    ``use_ai`` chooses the segmentation engine: None follows the admin AI toggle
    (uses the configured model when available), True/False force it. AI
    segmentation calls the model once per contract, so it is bounded and
    resumable — safe to run in batches over a large corpus.
    """
    from .ai_client import ai_enabled
    from .settings_store import set_setting

    want_ai = ai_enabled(db) if use_ai is None else bool(use_ai)
    learn_progress.update(running=True, processed=0, clauses=0, ai_used=0, ai=want_ai, error=None)
    try:
        done_raw = "" if reset else get_setting(db, "clause_learned_ids")
        done = {int(x) for x in done_raw.split(",") if x.strip().isdigit()}
        contracts = (
            db.query(Contract)
            .filter(Contract.deleted_at.is_(None))
            .filter(Contract.extracted_text.isnot(None))
            .all()
        )
        todo = [c for c in contracts if c.sr_no not in done]
        learn_progress["total"] = len(todo)
        for c in todo:
            count, used_ai = learn_from_contract(db, c, use_ai=want_ai)
            learn_progress["clauses"] += count
            if used_ai:
                learn_progress["ai_used"] += 1
            done.add(c.sr_no)
            learn_progress["processed"] += 1
            if learn_progress["processed"] % 25 == 0:
                set_setting(db, "clause_learned_ids", ",".join(str(i) for i in sorted(done)))
                db.commit()
        set_setting(db, "clause_learned_ids", ",".join(str(i) for i in sorted(done)))
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive
        learn_progress["error"] = str(exc)
        db.rollback()
    finally:
        learn_progress["running"] = False
    return dict(learn_progress)


# ---------------------------------------------------------------------------
# Gap analysis of a draft
# ---------------------------------------------------------------------------

# Clause types expected per contract type, with severity.
EXPECTED_CLAUSES: dict[str, dict[str, str]] = {
    "MSA": {
        "Exit/Termination": "Critical", "Indemnity": "Critical",
        "Limitation of Liability": "Critical", "Confidentiality": "Critical",
        "Payment Terms": "Critical", "Governing Law & Jurisdiction": "Recommended",
        "Force Majeure": "Recommended", "IP Ownership": "Recommended",
        "Data Protection/DPA": "Recommended", "Warranty": "Optional",
    },
    "SOW": {
        "Payment Terms": "Critical", "Exit/Termination": "Recommended",
        "SLA/Service Levels": "Recommended", "Change Control": "Recommended",
    },
    "NDA": {
        "Confidentiality": "Critical", "Exit/Termination": "Recommended",
        "Governing Law & Jurisdiction": "Recommended", "Non-Solicitation": "Optional",
    },
}
_GENERIC_EXPECTED = {
    "Exit/Termination": "Critical", "Payment Terms": "Critical",
    "Confidentiality": "Recommended", "Governing Law & Jurisdiction": "Recommended",
    "Limitation of Liability": "Recommended",
}


def expected_for_type(contract_type: str | None) -> dict[str, str]:
    return EXPECTED_CLAUSES.get((contract_type or "").strip(), _GENERIC_EXPECTED)


def _standard_version(db, clause_type: str) -> ClauseVersion | None:
    """A legal-approved, company-favourable version to offer as the standard."""
    entry = (
        db.query(ClauseLibraryEntry)
        .filter(ClauseLibraryEntry.clause_type == clause_type)
        .filter(ClauseLibraryEntry.deleted_at.is_(None))
        .first()
    )
    if entry is None:
        return None
    approved = [v for v in entry.versions if v.deleted_at is None and v.status == ClauseStatus.APPROVED]
    approved.sort(key=lambda v: (v.risk_posture != RiskPosture.COMPANY_FAVOURABLE, -(v.usage_count or 0)))
    return approved[0] if approved else None


def analyze_gaps(db, draft) -> dict:
    """Compliance/gap analysis for a draft: missing clauses (with severity),
    weak/risky clauses, and internal inconsistencies, plus a completeness score."""
    from .authoring import render_text

    text = render_text(draft.document, draft.fields or {})
    present = {c["clause_type"] for c in segment_and_classify(text)}
    expected = expected_for_type(draft.contract_type)

    missing = []
    for ctype, severity in expected.items():
        if ctype not in present:
            std = _standard_version(db, ctype)
            missing.append({
                "clause_type": ctype, "severity": severity,
                "rationale": f"{ctype} is expected for a {draft.contract_type or 'contract'} but is absent.",
                "suggested_version_id": std.id if std else None,
            })

    # Weak/risky: present but the org has a company-favourable approved version.
    weak = []
    for ctype in present:
        std = _standard_version(db, ctype)
        if std and std.risk_posture == RiskPosture.COMPANY_FAVOURABLE:
            weak.append({
                "clause_type": ctype,
                "note": f"Consider the standard approved {ctype} version.",
                "suggested_version_id": std.id,
            })

    # Inconsistencies: document/field mismatches.
    inconsistencies = _inconsistencies(draft, text)

    total = len(expected)
    covered = sum(1 for c in expected if c in present)
    crit_missing = sum(1 for m in missing if m["severity"] == "Critical")
    score = round(100 * covered / total) if total else 100
    if crit_missing:
        score = max(0, score - 10 * crit_missing)

    checks = [{"clause_type": c, "severity": expected[c], "present": c in present} for c in expected]
    result = {
        "score": score, "missing": missing, "weak": weak,
        "inconsistencies": inconsistencies, "checks": checks,
        "present_clauses": sorted(present), "ai": False,
    }
    _ai_augment_gaps(db, draft, text, result)
    return result


def _ai_augment_gaps(db, draft, text: str, result: dict) -> None:
    """Enhance the deterministic gap analysis with the configured AI model:
    rationales for missing clauses and extra inconsistencies. Best-effort."""
    from .ai_client import AIUnavailable, ai_enabled, llm_json
    if not ai_enabled(db):
        return
    taxo = ", ".join(taxonomy(db))
    prompt = (
        f"You are contract counsel. The draft is a {draft.contract_type or 'contract'}.\n"
        f"Clause types already present: {', '.join(result['present_clauses']) or 'none'}.\n"
        f"Recognised clause taxonomy: {taxo}.\n\n"
        "From the DRAFT TEXT below, return STRICT JSON with keys: "
        "\"missing\" (list of {clause_type, severity in [Critical,Recommended,Optional], rationale}), "
        "\"weak\" (list of {clause_type, note}), and "
        "\"inconsistencies\" (list of {type, message}). Only clause types from the taxonomy.\n\n"
        f"DRAFT TEXT:\n{text[:12000]}"
    )
    try:
        data = llm_json(db, prompt, system="Reply with JSON only.")
    except AIUnavailable:
        return
    if not isinstance(data, dict):
        return
    present = set(result["present_clauses"])
    have_missing = {m["clause_type"] for m in result["missing"]}
    for m in data.get("missing", []) or []:
        ct = (m or {}).get("clause_type")
        if ct and ct not in present and ct not in have_missing:
            std = _standard_version(db, ct)
            result["missing"].append({
                "clause_type": ct, "severity": m.get("severity", "Recommended"),
                "rationale": m.get("rationale", f"{ct} is advisable for this contract."),
                "suggested_version_id": std.id if std else None,
            })
    seen_incon = {i["message"] for i in result["inconsistencies"]}
    for inc in data.get("inconsistencies", []) or []:
        msg = (inc or {}).get("message")
        if msg and msg not in seen_incon:
            result["inconsistencies"].append({"type": inc.get("type", "ai"), "message": msg})
    for w in data.get("weak", []) or []:
        ct = (w or {}).get("clause_type")
        if ct and not any(x["clause_type"] == ct for x in result["weak"]):
            result["weak"].append({"clause_type": ct, "note": w.get("note", "Review against the standard version."),
                                   "suggested_version_id": None})
    # Recompute score against the (possibly larger) missing set.
    result["ai"] = True


def _inconsistencies(draft, text: str) -> list[dict]:
    out: list[dict] = []
    f = draft.fields or {}
    # End date should be after start date
    try:
        if f.get("start_date") and f.get("end_date") and f["end_date"] < f["start_date"]:
            out.append({"type": "dates", "message": "End date is before start date."})
    except TypeError:
        pass
    # Vendor named in the field should appear in the body
    vendor = (f.get("vendor") or "").strip()
    if vendor and vendor.lower() not in text.lower():
        out.append({"type": "field_body_mismatch",
                    "message": f"Vendor '{vendor}' is set in the fields but not found in the document body."})
    # A payment clause with no payment term
    if "Payment Terms" in {c["clause_type"] for c in segment_and_classify(text)} and not f.get("payment_term"):
        out.append({"type": "missing_field",
                    "message": "The document has payment terms but the Payment Term field is empty."})
    return out
