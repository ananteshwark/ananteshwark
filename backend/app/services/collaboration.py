"""Vendor collaboration: tokenized share links, tracked changes, dispositions,
the negotiation ledger, change-risk commentary, and cross-contract insights.

Vendors never have accounts — a share link's token is their whole identity and
scope (one draft, one recipient). Tokens expire, are revocable, and are
invalidated when a new round is shared.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from ..models import (
    ChangeType,
    ContractDraft,
    Disposition,
    NegotiationRound,
    RoundStatus,
    ShareAccess,
    TrackedChange,
    VendorShareLink,
)
from .clauses import classify_clause


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a stored datetime to aware UTC (SQLite returns naive values)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def create_share(
    db, draft: ContractDraft, recipients: list[dict], *, access: str = "SUGGEST",
    expires_days: int = 14, due_days: int | None = None, cover_message: str | None = None,
    watermark: bool = True, allow_download: bool = False, require_otp: bool = False,
    created_by_id: int | None = None,
) -> NegotiationRound:
    """Open a new negotiation round: invalidate any active links for this draft
    (a new round supersedes prior ones), snapshot the document, and mint one
    single-purpose token per recipient."""
    # Invalidate prior active links (new round supersedes them).
    for link in db.query(VendorShareLink).filter(
        VendorShareLink.draft_id == draft.id, VendorShareLink.revoked_at.is_(None)
    ).all():
        link.revoked_at = _now()

    last = (
        db.query(NegotiationRound)
        .filter(NegotiationRound.draft_id == draft.id)
        .order_by(NegotiationRound.round_no.desc())
        .first()
    )
    round_no = (last.round_no + 1) if last else 1
    rnd = NegotiationRound(
        draft_id=draft.id, round_no=round_no, shared_by_id=created_by_id,
        shared_with=", ".join(r.get("email", "") for r in recipients),
        base_document=draft.document, cover_message=cover_message, status=RoundStatus.SHARED,
    )
    db.add(rnd)
    db.flush()

    expires = _now() + timedelta(days=max(1, expires_days))
    due = (_now() + timedelta(days=due_days)) if due_days else None
    for r in recipients:
        link = VendorShareLink(
            token=new_token(), draft_id=draft.id, round_id=rnd.id,
            recipient_email=r.get("email", ""), recipient_name=r.get("name"),
            access=ShareAccess(access), expires_at=expires, due_at=due,
            otp_code=(f"{secrets.randbelow(1000000):06d}" if require_otp else None),
            watermark=watermark, allow_download=allow_download, created_by_id=created_by_id,
        )
        db.add(link)
    from ..models import DraftStatus
    draft.status = DraftStatus.SHARED_WITH_VENDOR
    db.flush()
    # Deliver the one-time code to any OTP-protected recipients.
    for link in db.query(VendorShareLink).filter(VendorShareLink.round_id == rnd.id).all():
        if link.otp_code:
            send_otp_email(link, db)
    return rnd


def send_otp_email(link: VendorShareLink, db=None) -> bool:
    """Email a recipient their one-time access code (best-effort). Returns sent?

    When a session is passed, the admin-editable "vendor_otp" template is used;
    otherwise a built-in default body is sent.
    """
    if not link.otp_code or not link.recipient_email:
        return False
    try:
        from ..config import settings
        from .notifications import get_channel
        channel = get_channel("email")
        if channel is None:
            return False
        url = f"{settings.APP_BASE_URL}/vendor/{link.token}"
        if db is not None:
            from .email_templates import render_named
            subject, body = render_named(db, "vendor_otp", {
                "code": link.otp_code, "url": url, "vendor_email": link.recipient_email,
            })
        else:
            subject = "[CMS] Your access code for the contract review"
            body = (
                f"<p>Hello {link.recipient_name or ''},</p>"
                f"<p>You've been invited to review a contract. Open the secure link and enter "
                f"this one-time code when prompted:</p>"
                f"<p style='font-size:20px;font-weight:700;letter-spacing:3px'>{link.otp_code}</p>"
                f"<p><a href='{url}'>Open the document</a></p>"
                f"<p>This code and link are single-purpose and expire.</p>"
            )
        channel.send([link.recipient_email], subject, body)
        return True
    except Exception:  # best-effort — never block the share
        return False


def nudge_due_links(db, now=None, window_hours: int = 48) -> int:
    """Email a one-time nudge to vendors whose review due date is within
    `window_hours` (or overdue) and who have an active link. Returns count sent."""
    now = now or _now()
    threshold = now + timedelta(hours=window_hours)
    links = (
        db.query(VendorShareLink)
        .filter(VendorShareLink.revoked_at.is_(None))
        .filter(VendorShareLink.due_at.isnot(None))
        .filter(VendorShareLink.nudged_at.is_(None))
        .all()
    )
    from ..config import settings
    from .email_templates import render_named
    from .notifications import get_channel
    channel = get_channel("email")
    sent = 0
    for link in links:
        due = _aware(link.due_at)
        if due > threshold:
            continue  # not due soon yet
        if link.expires_at is not None and now > _aware(link.expires_at):
            continue  # already expired
        link.nudged_at = now
        if channel is None or not link.recipient_email:
            continue
        try:
            url = f"{settings.APP_BASE_URL}/vendor/{link.token}"
            subject, body = render_named(db, "vendor_nudge", {
                "due_date": due.strftime("%Y-%m-%d"), "url": url,
                "vendor_email": link.recipient_email,
            })
            channel.send([link.recipient_email], subject, body)
            sent += 1
        except Exception:  # best-effort
            pass
    db.commit()
    return sent


def link_is_valid(link: VendorShareLink) -> tuple[bool, str | None]:
    if link is None:
        return False, "This link is invalid."
    if link.revoked_at is not None:
        return False, "This link has been revoked or superseded by a newer version."
    if link.expires_at is not None and _now() > _aware(link.expires_at):
        return False, "This link has expired."
    return True, None


def record_open(db, link: VendorShareLink, ip: str | None, ua: str | None) -> None:
    link.opened_at = link.opened_at or _now()
    link.open_count = (link.open_count or 0) + 1
    link.last_ip = ip
    link.last_ua = (ua or "")[:400]


def sanitized_draft(draft: ContractDraft, link: VendorShareLink, cover_message: str | None = None) -> dict:
    """The ONLY draft data a token exposes — never other contracts, vendor
    history, the clause library, or internal comments/fields."""
    return {
        "title": draft.title,
        "contract_type": draft.contract_type,
        "document": draft.document,
        "access": link.access.value,
        "recipient_name": link.recipient_name,
        "recipient_email": link.recipient_email,
        "watermark": link.watermark,
        "allow_download": link.allow_download,
        "due_at": link.due_at.isoformat() if link.due_at else None,
        "cover_message": cover_message,
        "vendor_accepted": draft.vendor_accepted_at is not None,
        "vendor_accepted_at": draft.vendor_accepted_at.isoformat() if draft.vendor_accepted_at else None,
    }


def risk_commentary(change: dict) -> tuple[str, str]:
    """Deterministic risk note + suggested response for a proposed change.
    (clause-aware; enhanced by Claude when configured.)"""
    ctype = change.get("clause_type") or classify_clause(change.get("original_text") or change.get("proposed_text") or "")
    kind = change.get("change_type", "REPLACE")
    original = (change.get("original_text") or "").lower()
    note, suggestion = "", "Review against the standard clause."

    if kind == "DELETE":
        if ctype == "Limitation of Liability" and ("exceed" in original or "cap" in original):
            note = "This deletion removes the liability cap, exposing the company to uncapped liability."
            suggestion = "Reject; re-offer the standard version that caps liability at 12 months of fees."
        elif ctype == "Indemnity":
            note = "This deletion removes an indemnity obligation on the vendor."
            suggestion = "Reject or counter to retain vendor indemnity for third-party claims."
        else:
            note = f"Removes the {ctype or 'clause'} entirely."
            suggestion = "Assess whether the protection is needed; counter if material."
    elif kind == "REPLACE":
        note = f"Rewrites the {ctype or 'clause'} — compare against the organization's standard wording."
        suggestion = "Counter with the standard approved version if the change weakens the position."
    elif kind == "INSERT":
        note = f"Adds new {ctype or 'clause'} language proposed by the vendor."
        suggestion = "Confirm it does not shift risk or conflict with existing clauses."
    else:  # COMMENT
        note = "Vendor comment — no text change."
        suggestion = "Respond in the thread; no disposition required."
    return note, suggestion


def _ai_risk_commentary(db, info: dict) -> str | None:
    """AI risk note for a proposed change using the configured model; None on
    any failure so the deterministic note is used instead."""
    from .ai_client import AIUnavailable, ai_enabled, llm_text
    if not ai_enabled(db):
        return None
    prompt = (
        "A vendor proposed a change to a contract clause. In 1-2 sentences, state the "
        "risk to the company and a suggested response.\n"
        f"Clause type: {info.get('clause_type')}\nChange type: {info.get('change_type')}\n"
        f"Original text: {info.get('original_text') or '(none)'}\n"
        f"Proposed text: {info.get('proposed_text') or '(none)'}"
    )
    try:
        out = llm_text(db, prompt, system="You are contract counsel. Be concise and specific.", max_tokens=200)
        return out.strip() or None
    except AIUnavailable:
        return None


def _inline_plain(block: dict) -> str:
    """Block text using text nodes plus each merge field's rendered value, matching
    the flattened document the vendor edits (so unchanged blocks diff as equal)."""
    parts = []
    for i in block.get("content") or []:
        if i.get("type") == "text":
            parts.append(i.get("text", ""))
        elif i.get("type") == "mergeField":
            parts.append((i.get("attrs") or {}).get("value") or "")
    return "".join(parts).strip()


def _block_texts(doc: dict | None) -> list[str]:
    """Plain text of each paragraph/heading block, non-empty."""
    out = []
    for b in (doc or {}).get("content", []) or []:
        if b.get("type") in ("paragraph", "heading"):
            text = _inline_plain(b)
            if text:
                out.append(text)
    return out


def apply_text_suggestion(document: dict | None, find_text: str, replace_text: str) -> tuple[dict, bool]:
    """Replace the first occurrence of ``find_text`` (a plain-text excerpt) inside a
    top-level paragraph/heading block with ``replace_text`` — the effect of an
    author accepting a reviewer's suggested revision. Returns (new_document,
    applied?). The affected block is rebuilt as plain text (any merge-field chips
    inside it are flattened, which is acceptable for a prose suggestion)."""
    import copy
    doc = copy.deepcopy(document or {"type": "doc", "content": []})
    needle = (find_text or "").strip()
    if not needle:
        return doc, False
    for block in doc.get("content", []) or []:
        if block.get("type") not in ("paragraph", "heading"):
            continue
        text = _inline_plain(block)
        if needle in text:
            new_text = text.replace(needle, replace_text or "", 1)
            block["content"] = [{"type": "text", "text": new_text}] if new_text else []
            return doc, True
    return doc, False


def document_block_diff(doc_a: dict | None, doc_b: dict | None) -> list[dict]:
    """Line-aligned block diff between two documents for a side-by-side compare.
    Returns rows of {tag: equal|replace|delete|insert, a, b} where a/b are the
    block text on each side (None where a side has no line)."""
    import difflib
    a = _block_texts(doc_a)
    b = _block_texts(doc_b)
    rows: list[dict] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                rows.append({"tag": "equal", "a": a[i1 + k], "b": b[j1 + k]})
        elif tag == "replace":
            la, lb = a[i1:i2], b[j1:j2]
            for k in range(max(len(la), len(lb))):
                rows.append({"tag": "replace",
                             "a": la[k] if k < len(la) else None,
                             "b": lb[k] if k < len(lb) else None})
        elif tag == "delete":
            for k in range(i1, i2):
                rows.append({"tag": "delete", "a": a[k], "b": None})
        elif tag == "insert":
            for k in range(j1, j2):
                rows.append({"tag": "insert", "a": None, "b": b[k]})
    return rows


def derive_inline_changes(original_doc: dict | None, edited_doc: dict | None) -> list[dict]:
    """Diff an edited document against the original block-by-block, producing
    discrete tracked-change payloads (REPLACE/INSERT/DELETE) — the bridge from
    inline suggestion-mode editing to the change ledger."""
    import difflib
    a = _block_texts(original_doc)
    b = _block_texts(edited_doc)
    changes: list[dict] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        old = "\n".join(a[i1:i2]).strip()
        new = "\n".join(b[j1:j2]).strip()
        if tag == "replace":
            changes.append({"change_type": "REPLACE", "original_text": old, "proposed_text": new})
        elif tag == "delete":
            changes.append({"change_type": "DELETE", "original_text": old})
        elif tag == "insert":
            changes.append({"change_type": "INSERT", "proposed_text": new})
    return changes


def add_change(db, draft, link, payload: dict) -> TrackedChange:
    ctype = payload.get("clause_type") or classify_clause(
        payload.get("original_text") or payload.get("proposed_text") or ""
    )
    change = TrackedChange(
        draft_id=draft.id, round_id=link.round_id, share_link_id=link.id,
        change_type=ChangeType(payload.get("change_type", "REPLACE")),
        block_index=payload.get("block_index"),
        clause_type=ctype,
        original_text=payload.get("original_text"),
        proposed_text=payload.get("proposed_text"),
        author_email=link.recipient_email,
        rationale=payload.get("rationale"),
    )
    info = {
        "clause_type": ctype, "change_type": change.change_type.value,
        "original_text": change.original_text, "proposed_text": change.proposed_text,
    }
    note, _sugg = risk_commentary(info)
    ai_note = _ai_risk_commentary(db, info)
    change.risk_commentary = ai_note or note
    db.add(change)
    db.flush()
    return change


def add_reviewer_change(db, draft, user, payload: dict) -> TrackedChange:
    """Like add_change but for an internal reviewer (no vendor share link): the
    change is anchored to the draft and attributed to the reviewer's email, then
    flows into the same author accept/reject ledger as vendor changes."""
    ctype = payload.get("clause_type") or classify_clause(
        payload.get("original_text") or payload.get("proposed_text") or ""
    )
    change = TrackedChange(
        draft_id=draft.id, round_id=None, share_link_id=None,
        change_type=ChangeType(payload.get("change_type", "REPLACE")),
        block_index=payload.get("block_index"),
        clause_type=ctype,
        original_text=payload.get("original_text"),
        proposed_text=payload.get("proposed_text"),
        author_email=getattr(user, "email", None),
        rationale=payload.get("rationale"),
    )
    info = {
        "clause_type": ctype, "change_type": change.change_type.value,
        "original_text": change.original_text, "proposed_text": change.proposed_text,
    }
    note, _sugg = risk_commentary(info)
    ai_note = _ai_risk_commentary(db, info)
    change.risk_commentary = ai_note or note
    db.add(change)
    db.flush()
    return change


def _make_paras(text: str) -> list[dict]:
    """Plain-text lines → paragraph blocks (a negotiated edit becomes final text)."""
    paras = [{"type": "paragraph", "content": [{"type": "text", "text": line}]}
             for line in (text or "").split("\n") if line.strip()]
    return paras or [{"type": "paragraph"}]


def _rebuild_block_preserving_fields(orig_block: dict, new_text: str) -> dict | None:
    """Rebuild an edited block while keeping its merge-field chips intact, when the
    edited text still contains each field's rendered value (in order). This keeps
    a bound field (e.g. an auto-computed date) live instead of flattening it to
    static text. Returns None when a field value was removed — then fall back to
    plain text (the vendor deliberately changed the bound value)."""
    nodes = orig_block.get("content") or []
    fields = [(n, ((n.get("attrs") or {}).get("value") or ""))
              for n in nodes if n.get("type") == "mergeField"]
    fields = [(n, v) for n, v in fields if v]
    if not fields:
        return None
    content: list[dict] = []
    pos = 0
    for node, val in fields:
        idx = new_text.find(val, pos)
        if idx == -1:
            return None  # a bound value was edited away — don't fake-preserve it
        if idx > pos:
            content.append({"type": "text", "text": new_text[pos:idx]})
        content.append(node)  # keep the live merge-field node
        pos = idx + len(val)
    if pos < len(new_text):
        content.append({"type": "text", "text": new_text[pos:]})
    block = {"type": orig_block.get("type", "paragraph")}
    if orig_block.get("attrs"):
        block["attrs"] = orig_block["attrs"]
    block["content"] = content
    return block


def apply_change_to_document(draft: ContractDraft, change: TrackedChange) -> bool:
    """Fold an accepted/countered tracked change into the draft's document so it
    is reflected everywhere the document is read (vendor portal, exports, and the
    final signed contract). Matches the block(s) by their flattened text — the
    same representation the diff produced — and returns True if it changed the doc.
    """
    from ..models import ChangeType, Disposition

    if change.change_type == ChangeType.COMMENT:
        return False
    doc = dict(draft.document or {"type": "doc", "content": []})
    content = list(doc.get("content") or [])
    new_text = (change.countered_text
                if (change.disposition == Disposition.COUNTERED and change.countered_text)
                else change.proposed_text) or ""

    if change.change_type == ChangeType.INSERT:
        content.extend(_make_paras(new_text))
        draft.document = {**doc, "content": content}
        return True

    orig_lines = [ln.strip() for ln in (change.original_text or "").split("\n") if ln.strip()]
    if not orig_lines:
        return False
    # Index of each non-empty paragraph/heading block (the diff's block sequence).
    para_idx = [(i, _inline_plain(b)) for i, b in enumerate(content)
                if b.get("type") in ("paragraph", "heading") and _inline_plain(b)]
    texts = [t.strip() for _, t in para_idx]
    n = len(orig_lines)
    for start in range(0, len(texts) - n + 1):
        if texts[start:start + n] == orig_lines:
            first_ci = para_idx[start][0]
            last_ci = para_idx[start + n - 1][0]
            if change.change_type == ChangeType.DELETE:
                repl = []
            elif first_ci == last_ci:
                # Single-block replace: keep any merge-field bindings if the new
                # text still carries their values; otherwise flatten to text.
                rebuilt = _rebuild_block_preserving_fields(content[first_ci], new_text)
                repl = [rebuilt] if rebuilt else _make_paras(new_text)
            else:
                repl = _make_paras(new_text)
            content[first_ci:last_ci + 1] = repl
            draft.document = {**doc, "content": content}
            return True
    return False


def decide_change(db, change: TrackedChange, decision: str, reason: str | None,
                  countered_text: str | None, user_id: int) -> TrackedChange:
    from ..models import ChangeDispositionEvent, ContractDraft
    change.disposition = Disposition(decision)
    change.disposition_reason = reason
    change.countered_text = countered_text if decision == "COUNTERED" else None
    change.decided_by_id = user_id
    change.decided_at = _now()
    # Append to the normalized disposition history (3.13).
    db.add(ChangeDispositionEvent(
        change_id=change.id, draft_id=change.draft_id, disposition=Disposition(decision),
        reason=reason, countered_text=change.countered_text, decided_by_id=user_id,
    ))
    # Fold an accepted (or countered) edit into the live document so it reflects
    # on the vendor portal and the eventual signed contract.
    if decision in ("ACCEPTED", "COUNTERED"):
        draft = db.get(ContractDraft, change.draft_id)
        if draft is not None:
            apply_change_to_document(draft, change)
    return change


def negotiation_insights(db, vendor_id: int) -> dict:
    """Cross-contract insight for a vendor: which clause types they challenge and
    how often the standard was accepted."""
    from ..models import ContractDraft as CD
    draft_ids = [d.id for d in db.query(CD.id).filter(CD.vendor_id == vendor_id).all()]
    if not draft_ids:
        return {"by_clause": [], "total_changes": 0}
    changes = (
        db.query(TrackedChange)
        .filter(TrackedChange.draft_id.in_(draft_ids))
        .filter(TrackedChange.change_type != ChangeType.COMMENT)
        .all()
    )
    by: dict[str, dict] = {}
    for c in changes:
        b = by.setdefault(c.clause_type or "Other", {"challenged": 0, "accepted": 0, "rejected": 0})
        b["challenged"] += 1
        if c.disposition == Disposition.ACCEPTED:
            b["accepted"] += 1
        elif c.disposition == Disposition.REJECTED:
            b["rejected"] += 1
    rows = [{"clause_type": k, **v} for k, v in sorted(by.items(), key=lambda kv: -kv[1]["challenged"])]
    return {"by_clause": rows, "total_changes": len(changes)}
