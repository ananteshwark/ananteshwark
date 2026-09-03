"""Alert admins when a document extraction fails.

Sends an email to the configured recipients (or all active admins if none are
configured) and optionally POSTs a JSON event to a webhook. All best-effort:
alerting never raises back into the extraction worker.
"""
import json
import logging
import urllib.request

from sqlalchemy.orm import Session

from ..config import settings
from ..models import User, UserRole
from .notifications import get_channel
from .settings_store import get_setting
from .url_guard import assert_safe_outbound_url

log = logging.getLogger(__name__)


def alerts_enabled(db: Session) -> bool:
    return get_setting(db, "failure_alerts_enabled") == "true"


def resolve_alert_recipients(db: Session) -> list[str]:
    raw = get_setting(db, "failure_alert_emails")
    emails = [e.strip() for e in raw.replace("\n", ",").split(",") if e.strip()]
    if emails:
        return emails
    # Default: every active administrator
    admins = (
        db.query(User)
        .filter(User.role == UserRole.ADMIN, User.is_active.is_(True), User.deleted_at.is_(None))
        .all()
    )
    return [a.email for a in admins]


def notify_extraction_failure(db: Session, ingestion_file, error: str) -> None:
    if not alerts_enabled(db):
        return

    log_url = f"{settings.APP_BASE_URL}/ingestion"
    # Email
    try:
        recipients = resolve_alert_recipients(db)
        channel = get_channel("email")
        if recipients and channel is not None:
            subject = f"[CMS] Extraction failed: {ingestion_file.filename}"
            body = (
                f"<p>A document failed extraction and needs attention.</p>"
                f"<ul>"
                f"<li><b>File:</b> {ingestion_file.filename}</li>"
                f"<li><b>Path:</b> {ingestion_file.path}</li>"
                f"<li><b>Source:</b> {getattr(ingestion_file, 'source', 'LOCAL')}</li>"
                f"<li><b>Error:</b> {error}</li>"
                f"</ul>"
                f'<p><a href="{log_url}">Open the Ingestion Log</a> to review and retry.</p>'
            )
            channel.send(recipients, subject, body)
    except Exception:
        log.exception("Failed to send extraction-failure email alert")

    # Webhook (optional)
    webhook = get_setting(db, "failure_alert_webhook")
    if webhook:
        try:
            payload = json.dumps({
                "event": "extraction_failed",
                "ingestion_id": ingestion_file.id,
                "filename": ingestion_file.filename,
                "path": ingestion_file.path,
                "error": error,
            }).encode()
            assert_safe_outbound_url(webhook)
            req = urllib.request.Request(
                webhook, data=payload, headers={"Content-Type": "application/json"}, method="POST"
            )
            urllib.request.urlopen(req, timeout=10).close()
        except Exception:
            log.exception("Failed to POST extraction-failure webhook")
