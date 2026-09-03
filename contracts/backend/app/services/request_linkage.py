"""Keeping a contract request in step with the draft it produced.

Converting a request marks it CONVERTED and stores `draft_id`. Nothing put the
reverse edge back: deleting the draft from the drafting queue left the request
sitting at CONVERTED, pointing at a draft that no longer exists. The requester
saw their request as handled, the triage queue no longer showed it as something
to act on, and the only way back was to raise a second request.

Draft deletion is soft and reversible, so this is symmetric: deletion returns
the request to the queue, restoring the draft re-links it.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import ContractDraft, ContractRequest, RequestStatus


def _linked(db: Session, draft: ContractDraft) -> list[ContractRequest]:
    return db.query(ContractRequest).filter(ContractRequest.draft_id == draft.id).all()


def on_draft_deleted(db: Session, draft: ContractDraft) -> list[int]:
    """Return every request converted into this draft to the triage queue.

    IN_REVIEW rather than SUBMITTED: someone did triage it, and the work of
    deciding who owns it and what it is should not be thrown away just because
    the draft was discarded. Returns the request ids that moved, so the caller
    can say so.
    """
    moved = []
    for req in _linked(db, draft):
        req.draft_id = None
        if req.status == RequestStatus.CONVERTED:
            req.status = RequestStatus.IN_REVIEW
        moved.append(req.id)
    return moved


def on_draft_restored(db: Session, draft: ContractDraft) -> list[int]:
    """Re-link requests that were pointed at this draft before it was deleted.

    The forward edge (`request.draft_id`) is the one that was cleared, so the
    audit log is what remembers the pairing. A request that has since been
    converted into some other draft is left alone — that newer decision wins.
    """
    from ..models import AuditLog

    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "contract_request",
                AuditLog.action == "UNCONVERT",
                AuditLog.new_value == f"draft #{draft.id} deleted")
        .all()
    )
    moved = []
    for row in rows:
        req = db.get(ContractRequest, row.entity_id)
        if req is None or req.draft_id is not None:
            continue
        req.draft_id = draft.id
        req.status = RequestStatus.CONVERTED
        moved.append(req.id)
    return moved
