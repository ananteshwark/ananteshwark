"""Admin-editable notification templates.

Each notification kind has a built-in default (subject + HTML body) and a list
of placeholders it exposes. Admins may override any of them via the
`/settings/email-templates` endpoints; when no override exists the built-in
default is used. Rendering is a simple ``{placeholder}`` substitution — no
expression evaluation — so the templates are safe to expose in the admin UI.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import EmailTemplate
from .reminders import DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_SUBJECT

# name -> default definition. `placeholders` documents what the caller supplies.
DEFAULTS: dict[str, dict] = {
    "approval_request": {
        "label": "Approval requested",
        "description": "Sent to Legal/Approvers when an author requests an approval gate.",
        "subject": "[CMS] {gate} approval requested — draft #{draft_id}",
        "body": (
            "<p>{message}.</p>"
            "<p><a href='{url}'>Open the draft to review and decide</a>.</p>"
        ),
        "placeholders": ["gate", "draft_id", "draft_title", "requested_by", "message", "url"],
    },
    "vendor_disposition": {
        "label": "Vendor decision update",
        "description": "Sent to a vendor when their proposed changes have been reviewed.",
        "subject": "[CMS] Updated contract draft for your review",
        "body": (
            "<p>We have reviewed your proposed changes. Summary:</p>"
            "{summary_html}"
            "<p><a href='{url}'>Open the updated draft</a> (link expires and is single-use).</p>"
        ),
        "placeholders": ["summary_html", "url", "vendor_email"],
    },
    "vendor_nudge": {
        "label": "Vendor due-date nudge",
        "description": "Reminds a vendor to respond as their review due date approaches.",
        "subject": "[CMS] Reminder: your review is due {due_date}",
        "body": (
            "<p>This is a friendly reminder that your review of the shared contract draft "
            "is due {due_date}.</p>"
            "<p><a href='{url}'>Open the draft</a> to review and return your changes.</p>"
        ),
        "placeholders": ["due_date", "url", "vendor_email"],
    },
    "vendor_otp": {
        "label": "Vendor access code (OTP)",
        "description": "Sent to a vendor with the one-time code needed to open a shared draft.",
        "subject": "[CMS] Your access code for the contract draft",
        "body": (
            "<p>Use this one-time code to open the contract draft shared with you:</p>"
            "<p style='font-size:22px;font-weight:700;letter-spacing:3px'>{code}</p>"
            "<p><a href='{url}'>Open the draft</a> and enter the code when prompted.</p>"
        ),
        "placeholders": ["code", "url", "vendor_email"],
    },
    "expiry_reminder": {
        "label": "Contract expiry reminder",
        "description": "Sent to department recipients as a contract approaches its end date.",
        "subject": DEFAULT_TEMPLATE_SUBJECT,
        "body": DEFAULT_TEMPLATE_BODY.strip(),
        # `document_link` is deliberately absent: it used to render the server's
        # own filesystem path, which no recipient could open. The document is
        # attached to the email now, and `document_note` says so (or says why it
        # could not be). Templates saved with the old placeholder still render —
        # it resolves to the contract record — but it is not offered again.
        "placeholders": ["vendor", "signing_entity", "department", "contract_service",
                         "service_summary", "po_number", "contract_value", "currency",
                         "end_date", "days_remaining", "contract_url", "renewal_link",
                         "document_note"],
    },
}


def _render(template: str, context: dict) -> str:
    out = template or ""
    for key, value in context.items():
        out = out.replace("{" + key + "}", "" if value is None else str(value))
    return out


def render_named(db: Session, name: str, context: dict) -> tuple[str, str]:
    """Return (subject, body) for a named template, applying any admin override."""
    default = DEFAULTS.get(name, {})
    row = db.query(EmailTemplate).filter(EmailTemplate.name == name).first()
    subject_tpl = row.subject if row else default.get("subject", "")
    body_tpl = row.body if row else default.get("body", "")
    return _render(subject_tpl, context), _render(body_tpl, context)


def catalog(db: Session) -> list[dict]:
    """Every known template merged with its admin override, for the settings UI."""
    rows = {t.name: t for t in db.query(EmailTemplate).all()}
    out: list[dict] = []
    for name, d in DEFAULTS.items():
        row = rows.get(name)
        out.append({
            "name": name,
            "label": d.get("label", name),
            "description": d.get("description", ""),
            "subject": row.subject if row else d.get("subject", ""),
            "body": row.body if row else d.get("body", ""),
            "placeholders": d.get("placeholders", []),
            "default_subject": d.get("subject", ""),
            "default_body": d.get("body", ""),
            "customized": row is not None,
        })
    for name, row in rows.items():
        if name not in DEFAULTS:
            out.append({
                "name": name, "label": name, "description": "", "subject": row.subject,
                "body": row.body, "placeholders": [], "default_subject": row.subject,
                "default_body": row.body, "customized": True,
            })
    return out
