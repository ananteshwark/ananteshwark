"""Scheduled + on-demand delivery of custom reports (G8). Runs a report
definition and emails the result (summary + inline CSV) to its recipients. The
daily scheduler calls run_due_reports; the API calls deliver_report directly."""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from ..models import ReportDefinition
from .notifications import get_channel
from .report_builder import report_to_csv, run_report

log = logging.getLogger(__name__)


def deliver_report(db: Session, definition: ReportDefinition) -> tuple[bool, str]:
    recipients = [r.strip() for r in (definition.recipients or []) if r and r.strip()]
    if not recipients:
        return False, "No recipients configured"
    result = run_report(db, definition)
    csv_text = report_to_csv(result)
    channel = get_channel("email")
    if channel is None:
        return False, "Email channel is not configured"
    subject = f"[Contract MS] Report: {definition.name} ({result['total']} rows)"
    body = (
        f"{definition.name}\n{definition.description or ''}\n\n"
        f"{result['total']} row(s) as of {date.today().isoformat()}.\n\n"
        f"{csv_text}"
    )
    try:
        channel.send(recipients, subject, body)
    except Exception as exc:  # best-effort; surfaced to the caller
        log.exception("Report delivery failed for %s", definition.id)
        return False, f"Send failed: {exc}"
    definition.last_run_at = datetime.now(timezone.utc)
    return True, f"Sent to {len(recipients)} recipient(s)"


def _is_due(definition: ReportDefinition, today: date) -> bool:
    sched = (definition.schedule or "none").lower()
    if sched == "daily":
        return True
    if sched == "weekly":
        # schedule_day: 0=Mon … 6=Sun (Python weekday()).
        return today.weekday() == (definition.schedule_day if definition.schedule_day is not None else 0)
    if sched == "monthly":
        return today.day == (definition.schedule_day if definition.schedule_day else 1)
    return False


def run_due_reports(db: Session, today: date | None = None) -> dict:
    """Deliver every active scheduled report that is due today. Called by the
    daily scheduler job."""
    today = today or date.today()
    rows = (
        db.query(ReportDefinition)
        .filter(ReportDefinition.deleted_at.is_(None), ReportDefinition.active.is_(True))
        .all()
    )
    sent = 0
    for d in rows:
        if d.schedule and d.schedule != "none" and _is_due(d, today):
            ok, _detail = deliver_report(db, d)
            if ok:
                sent += 1
    if sent:
        db.commit()
    return {"delivered": sent, "checked": len(rows)}
