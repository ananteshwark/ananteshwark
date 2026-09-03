"""Obligation reminders (F2).

Closes the extract → track → chase loop: obligations carry due dates, so they
should drive the same notify/escalate machinery contracts already use. Runs
inside the existing daily scheduler job.

Firing is idempotent by construction: a reminder goes out only on an exact
offset day (and on the exact escalation day), so a second run on the same date
re-sends nothing new.
"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session, joinedload

from ..models import Contract, ContractMilestone, MilestoneStatus, User
from .notifications import get_channel
from .settings_store import get_setting

log = logging.getLogger(__name__)


def _offsets(db: Session) -> list[int]:
    raw = get_setting(db, "obligation_reminder_offsets") or ""
    out = []
    for part in raw.replace("\n", ",").split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            out.append(int(part))
    return sorted(set(out), reverse=True)


def _escalate_after(db: Session) -> int | None:
    raw = (get_setting(db, "obligation_escalate_after_days") or "").strip()
    return int(raw) if raw.isdigit() else None


def _owner_email(db: Session, m: ContractMilestone) -> tuple[int | None, str | None]:
    """(user_id, email) of whoever should be chased: the obligation's owner,
    else the contract's assignee."""
    if m.owner_user_id:
        u = db.get(User, m.owner_user_id)
        if u and u.is_active:
            return u.id, u.email
    c = m.contract
    if c is not None and c.assignee_id:
        u = db.get(User, c.assignee_id)
        if u and u.is_active:
            return u.id, u.email
    return None, None


def _message(m: ContractMilestone, days: int) -> str:
    when = (f"due in {days} day(s)" if days > 0
            else "due today" if days == 0
            else f"overdue by {-days} day(s)")
    return f"Obligation “{m.title}” on contract #{m.contract_id} is {when}."


def run_obligation_reminders(db: Session, today: date | None = None) -> dict:
    """Notify owners of obligations hitting a reminder offset, and escalate the
    ones that have been overdue past the configured threshold."""
    if get_setting(db, "obligation_reminders_enabled") == "false":
        return {"notified": 0, "escalated": 0, "skipped": "disabled"}
    today = today or date.today()
    offsets = _offsets(db)
    escalate_after = _escalate_after(db)
    if not offsets and escalate_after is None:
        return {"notified": 0, "escalated": 0}

    rows = (
        db.query(ContractMilestone)
        .options(joinedload(ContractMilestone.contract))
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None),
                ContractMilestone.status == MilestoneStatus.PENDING,
                ContractMilestone.due_date.isnot(None),
                Contract.deleted_at.is_(None))
        .all()
    )

    from .user_notifications import create_notification
    channel = get_channel("email")
    notified = escalated = 0

    for m in rows:
        days = (m.due_date - today).days
        is_offset = days in offsets
        is_escalation = escalate_after is not None and days == -escalate_after
        if not (is_offset or is_escalation):
            continue

        user_id, email = _owner_email(db, m)
        if not user_id and not email:
            # Nobody to chase — an unassigned obligation on an unassigned
            # contract. Counting this as "notified" overstated the run.
            log.debug("Obligation %s is due but has no owner to notify", m.id)
            continue
        body = _message(m, days)
        link = f"/contracts/{m.contract_id}"

        if user_id:
            create_notification(db, user_id, "obligation", body, link)
        if channel is not None and email:
            subject = ("[Contract MS] Obligation overdue" if days < 0
                       else "[Contract MS] Obligation due")
            try:
                channel.send([email], subject, body)
            except Exception:
                log.exception("Obligation reminder email failed for milestone %s", m.id)

        if is_escalation:
            escalated += 1
            # Escalate to the contract's configured escalation contact, if any.
            c = m.contract
            esc = (c.escalation_email if c is not None else None)
            if channel is not None and esc:
                try:
                    channel.send([esc], "[Contract MS] Obligation escalation",
                                 f"{body}\n\nThis obligation has been overdue for "
                                 f"{escalate_after} day(s) without being closed.")
                except Exception:
                    log.exception("Obligation escalation email failed for milestone %s", m.id)
        else:
            notified += 1

    db.commit()
    log.info("Obligation reminders for %s: %d notified, %d escalated", today, notified, escalated)
    return {"notified": notified, "escalated": escalated}
