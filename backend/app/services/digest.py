"""Scheduled summary ("digest") email for admins/managers.

A daily or weekly rollup of the three things that need human attention:
contracts waiting in the validation queue, contracts approaching expiry, and
documents that failed extraction. `build_digest` gathers the data, and
`render_digest` turns it into a subject/body — both are pure and unit-tested;
`send_digest` wires them to the email channel and the recipient settings.
"""
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Contract,
    ContractStatus,
    IngestionFile,
    IngestionStatus,
    LifecycleStatus,
    User,
    UserRole,
)
from .notifications import get_channel
from .settings_store import get_setting

log = logging.getLogger(__name__)

# Contracts expiring within this many days are surfaced in the digest.
EXPIRY_HORIZON_DAYS = 30
# Cap the per-section lists so the email stays readable on very large datasets.
MAX_ROWS = 25


def digest_enabled(db: Session) -> bool:
    return get_setting(db, "digest_enabled") == "true"


def resolve_digest_recipients(db: Session) -> list[str]:
    raw = get_setting(db, "digest_recipients")
    emails = [e.strip() for e in raw.replace("\n", ",").split(",") if e.strip()]
    if emails:
        return emails
    admins = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active.is_(True), User.deleted_at.is_(None))
        .all()
    )
    return [a.email for a in admins]


def build_digest(db: Session, today: date | None = None) -> dict:
    """Gather the digest data. Pure read — no side effects."""
    if today is None:
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()

    pending_q = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.PENDING_VALIDATION)
        .filter(Contract.deleted_at.is_(None))
    )
    pending_total = pending_q.count()
    pending_rows = pending_q.order_by(Contract.sr_no.desc()).limit(MAX_ROWS).all()

    expiring_q = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.lifecycle_status.in_([LifecycleStatus.ACTIVE, LifecycleStatus.EXPIRED]))
        .filter(Contract.end_date.isnot(None))
        .filter(Contract.end_date >= today)
        .filter(Contract.end_date <= today + timedelta(days=EXPIRY_HORIZON_DAYS))
    )
    expiring_total = expiring_q.count()
    expiring_rows = expiring_q.order_by(Contract.end_date.asc()).limit(MAX_ROWS).all()

    failed_q = (
        db.query(IngestionFile)
        .filter(IngestionFile.status == IngestionStatus.FAILED)
    )
    failed_total = failed_q.count()
    failed_rows = failed_q.order_by(IngestionFile.detected_at.desc()).limit(MAX_ROWS).all()

    from ..models import ContractMilestone, MilestoneStatus
    milestone_q = (
        db.query(ContractMilestone, Contract)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None))
        .filter(ContractMilestone.status == MilestoneStatus.PENDING)
        .filter(ContractMilestone.due_date.isnot(None))
        .filter(ContractMilestone.due_date <= today + timedelta(days=EXPIRY_HORIZON_DAYS))
        .filter(Contract.deleted_at.is_(None))
    )
    milestone_total = milestone_q.count()
    milestone_rows = milestone_q.order_by(ContractMilestone.due_date.asc()).limit(MAX_ROWS).all()

    def _vendor(c: Contract) -> str:
        return (c.vendor.name if c.vendor else None) or c.vendor_name_raw or "(unknown)"

    return {
        "date": today,
        "pending": {
            "total": pending_total,
            "rows": [
                {"sr_no": c.sr_no, "vendor": _vendor(c), "service": c.contract_service}
                for c in pending_rows
            ],
        },
        "expiring": {
            "total": expiring_total,
            "horizon_days": EXPIRY_HORIZON_DAYS,
            "rows": [
                {
                    "sr_no": c.sr_no,
                    "vendor": _vendor(c),
                    "department": c.department.name if c.department else None,
                    "end_date": c.end_date,
                    "days_remaining": (c.end_date - today).days,
                }
                for c in expiring_rows
            ],
        },
        "failed": {
            "total": failed_total,
            "rows": [
                {"filename": f.filename, "error": f.error}
                for f in failed_rows
            ],
        },
        "milestones": {
            "total": milestone_total,
            "horizon_days": EXPIRY_HORIZON_DAYS,
            "rows": [
                {"sr_no": m.contract_id, "title": m.title, "vendor": _vendor(c),
                 "due_date": m.due_date, "overdue": m.due_date < today}
                for m, c in milestone_rows
            ],
        },
    }


def has_content(summary: dict) -> bool:
    """True when there's anything worth emailing about."""
    return (
        summary["pending"]["total"] > 0
        or summary["expiring"]["total"] > 0
        or summary["failed"]["total"] > 0
        or summary.get("milestones", {}).get("total", 0) > 0
    )


def _section(title: str, total: int, shown: int, rows_html: str) -> str:
    heading = f"<h3>{title} ({total})</h3>"
    if total == 0:
        return heading + "<p>None.</p>"
    more = ""
    if total > shown:
        more = f"<p><i>…and {total - shown} more.</i></p>"
    return heading + "<ul>" + rows_html + "</ul>" + more


def render_digest(summary: dict, base_url: str | None = None) -> tuple[str, str]:
    """Turn a digest summary into (subject, html_body). Pure."""
    base_url = (base_url or settings.APP_BASE_URL).rstrip("/")
    day = summary["date"]
    pending, expiring, failed = summary["pending"], summary["expiring"], summary["failed"]

    subject = (
        f"[CMS] Contract digest {day} — "
        f"{pending['total']} pending, {expiring['total']} expiring, {failed['total']} failed"
    )

    pending_rows = "".join(
        f'<li><a href="{base_url}/contracts/{r["sr_no"]}">#{r["sr_no"]}</a> '
        f'{r["vendor"]} — {r["service"] or "—"}</li>'
        for r in pending["rows"]
    )
    expiring_rows = "".join(
        f'<li><a href="{base_url}/contracts/{r["sr_no"]}">#{r["sr_no"]}</a> '
        f'{r["vendor"]} ({r["department"] or "unassigned"}) — expires {r["end_date"]} '
        f'({r["days_remaining"]} day(s) left)</li>'
        for r in expiring["rows"]
    )
    failed_rows = "".join(
        f'<li>{r["filename"]} — {r["error"] or "extraction failed"}</li>'
        for r in failed["rows"]
    )
    milestones = summary.get("milestones", {"total": 0, "rows": [], "horizon_days": expiring["horizon_days"]})
    milestone_rows = "".join(
        f'<li><a href="{base_url}/contracts/{r["sr_no"]}">#{r["sr_no"]}</a> '
        f'{r["vendor"]}: {r["title"]} — due {r["due_date"]}{" (overdue)" if r["overdue"] else ""}</li>'
        for r in milestones["rows"]
    )

    body = (
        f"<p>Daily Contract Management System summary for <b>{day}</b>.</p>"
        + _section("Contracts awaiting validation", pending["total"], len(pending["rows"]), pending_rows)
        + _section(
            f"Contracts expiring within {expiring['horizon_days']} days",
            expiring["total"], len(expiring["rows"]), expiring_rows,
        )
        + _section(
            f"Obligations due within {milestones['horizon_days']} days",
            milestones["total"], len(milestones["rows"]), milestone_rows,
        )
        + _section("Documents that failed extraction", failed["total"], len(failed["rows"]), failed_rows)
        + f'<p><a href="{base_url}">Open the dashboard</a></p>'
    )
    return subject, body


def send_digest(db: Session, today: date | None = None, force: bool = False) -> dict:
    """Build and send the digest. `force` sends even with no content (manual test).

    Returns a small result dict describing what happened (used by the API).
    """
    summary = build_digest(db, today)
    if not force and not has_content(summary):
        log.info("Digest skipped: nothing to report")
        return {"sent": False, "reason": "nothing to report", "summary": _counts(summary)}

    recipients = resolve_digest_recipients(db)
    if not recipients:
        log.info("Digest skipped: no recipients")
        return {"sent": False, "reason": "no recipients", "summary": _counts(summary)}

    channel = get_channel("email")
    if channel is None:
        return {"sent": False, "reason": "email channel unavailable", "summary": _counts(summary)}

    subject, body = render_digest(summary)
    try:
        channel.send(recipients, subject, body)
    except Exception as exc:
        log.exception("Digest send failed")
        return {"sent": False, "reason": f"send failed: {exc}", "summary": _counts(summary)}

    chat_channels = _post_digest_to_chat(db, subject, body)

    log.info("Digest sent to %d recipient(s)", len(recipients))
    result = {"sent": True, "recipients": recipients, "summary": _counts(summary)}
    if chat_channels:
        result["chat_channels"] = chat_channels
    return result


def _post_digest_to_chat(db: Session, subject: str, body: str) -> list[str]:
    """Optionally post the digest to Slack/Teams if enabled and configured.
    Best-effort — never fails the email digest. Returns the channels posted to."""
    if get_setting(db, "digest_chat_enabled") != "true":
        return []
    posted = []
    for name in ("slack", "teams"):
        if not get_setting(db, f"{name}_webhook_url"):
            continue
        channel = get_channel(name)
        if channel is None:
            continue
        try:
            channel.send([], subject, body)
            posted.append(name)
        except Exception:
            log.exception("Digest chat post to %s failed", name)
    return posted


def _counts(summary: dict) -> dict:
    return {
        "pending": summary["pending"]["total"],
        "expiring": summary["expiring"]["total"],
        "failed": summary["failed"]["total"],
        "milestones": summary.get("milestones", {}).get("total", 0),
    }
