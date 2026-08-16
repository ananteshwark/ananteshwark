"""Outbound contract-event webhooks.

Fires a JSON POST to an admin-configured URL when a contract changes state
(validated, rejected, renewed, terminated). Best-effort: delivery never raises
back into the request that triggered it. If a signing secret is configured the
payload is signed with HMAC-SHA256 in the X-CMS-Signature header so the
receiver can verify authenticity.
"""
import hashlib
import hmac
import json
import logging
import urllib.request
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .settings_store import get_setting

log = logging.getLogger(__name__)

# Event types the system can emit (also used to validate the subscription list).
EVENT_TYPES = {
    "contract.validated",
    "contract.rejected",
    "contract.renewed",
    "contract.terminated",
}


def _enabled_events(db: Session) -> set[str]:
    if get_setting(db, "event_webhook_enabled") != "true":
        return set()
    raw = get_setting(db, "event_webhook_events")
    if not raw.strip():
        return set(EVENT_TYPES)  # blank = all events
    return {e.strip() for e in raw.replace("\n", ",").split(",") if e.strip()} & EVENT_TYPES


def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def build_event(event_type: str, contract) -> dict:
    """Build the JSON-serializable event body for a contract."""
    return {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {
            "sr_no": contract.sr_no,
            "status": contract.status.value,
            "lifecycle_status": contract.lifecycle_status.value,
            "vendor": (contract.vendor.name if contract.vendor else None) or contract.vendor_name_raw,
            "signing_entity": contract.signing_entity,
            "contract_type": contract.contract_type,
            "department": contract.department.name if contract.department else None,
            "po_number": contract.po_number,
            "contract_value": float(contract.contract_value) if contract.contract_value is not None else None,
            "currency": contract.currency,
            "start_date": contract.start_date.isoformat() if contract.start_date else None,
            "end_date": contract.end_date.isoformat() if contract.end_date else None,
        },
    }


def _deliver(url: str, secret: str, event: dict) -> None:
    body = json.dumps(event).encode()
    headers = {"Content-Type": "application/json", "X-CMS-Event": event["event"]}
    if secret:
        headers["X-CMS-Signature"] = sign_payload(secret, body)
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    urllib.request.urlopen(req, timeout=15).close()


def emit_event(db: Session, event_type: str, contract) -> None:
    """Fire the webhook for a contract event if enabled and subscribed."""
    if event_type not in _enabled_events(db):
        return
    url = get_setting(db, "event_webhook_url")
    if not url:
        return
    secret = get_setting(db, "event_webhook_secret")
    try:
        _deliver(url, secret, build_event(event_type, contract))
        log.info("Event webhook delivered: %s for contract %s", event_type, contract.sr_no)
    except Exception:
        log.exception("Event webhook delivery failed: %s for contract %s", event_type, contract.sr_no)
