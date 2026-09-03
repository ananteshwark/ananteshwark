"""Pluggable notification channel layer. Email plus Slack/Teams incoming
webhooks are implemented; additional channels register themselves in CHANNELS."""
import json
import logging
import mimetypes
import re
import smtplib
import urllib.request
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import settings

log = logging.getLogger(__name__)

# One attachment: (filename, bytes, mime type). The mime type may be None, in
# which case it is guessed from the filename.
Attachment = tuple[str, bytes, str | None]


class NotificationChannel:
    name = "base"

    def send(self, to: list[str], subject: str, body: str, cc: list[str] | None = None,
             attachments: list[Attachment] | None = None) -> None:
        raise NotImplementedError


def _html_to_text(html: str) -> str:
    """Best-effort HTML → plain text for chat webhooks."""
    text = re.sub(r"(?i)<br\s*/?>", "\n", html or "")
    text = re.sub(r"(?i)</(p|li|ul|div|h[1-6])>", "\n", text)
    text = re.sub(r"(?i)<li>", "• ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _post_json(url: str, payload: dict) -> None:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    urllib.request.urlopen(req, timeout=15).close()


def _smtp_config() -> dict:
    """Admin-configured SMTP settings from the DB, falling back to env config."""
    from ..database import SessionLocal
    from .settings_store import get_setting

    db = SessionLocal()
    try:
        return {
            "host": get_setting(db, "smtp_host") or settings.SMTP_HOST,
            "port": int(get_setting(db, "smtp_port") or settings.SMTP_PORT),
            "user": get_setting(db, "smtp_user"),
            "password": get_setting(db, "smtp_password"),
            "from": get_setting(db, "smtp_from") or settings.SMTP_FROM,
            "tls": get_setting(db, "smtp_tls") == "true",
            "dry_run": get_setting(db, "email_dry_run") == "true",
        }
    finally:
        db.close()


class EmailChannel(NotificationChannel):
    name = "email"

    def send(self, to: list[str], subject: str, body: str, cc: list[str] | None = None,
             attachments: list[Attachment] | None = None) -> None:
        cc = cc or []
        cfg = _smtp_config()
        if cfg["dry_run"]:
            log.info("[EMAIL DRY RUN] to=%s cc=%s subject=%r attachments=%s",
                     to, cc, subject, [a[0] for a in attachments or []])
            return
        if attachments:
            # 'mixed' with the HTML as the first part: the body renders as the
            # message and the files hang off it, which is what every mail client
            # expects. A plain MIMEText cannot carry a file at all.
            msg = MIMEMultipart("mixed")
            msg.attach(MIMEText(body, "html"))
            for filename, data, mime in attachments:
                mime = mime or mimetypes.guess_type(filename)[0] or "application/octet-stream"
                maintype, _, subtype = mime.partition("/")
                # MIMEBase rather than MIMEApplication so a scanned contract
                # keeps its real type (image/png) instead of being labelled
                # application/png, which some clients refuse to preview.
                part = MIMEBase(maintype or "application", subtype or "octet-stream")
                part.set_payload(data)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=filename)
                msg.attach(part)
        else:
            msg = MIMEText(body, "html")
        msg["Subject"] = subject
        msg["From"] = cfg["from"]
        msg["To"] = ", ".join(to)
        if cc:
            msg["Cc"] = ", ".join(cc)
        _smtp_send(cfg, to + cc, msg)


def _smtp_send(cfg: dict, recipients: list[str], msg) -> None:
    """Deliver a message, negotiating TLS the way real relays expect.

    - Port 465 uses implicit SSL (SMTP_SSL); no STARTTLS.
    - Otherwise (587/25) STARTTLS is used when TLS is enabled — and also
      opportunistically when credentials are set but the server only advertises
      AUTH after STARTTLS (e.g. Google Workspace on 587). This is what fixes
      "SMTP AUTH extension not supported by server".
    """
    port = cfg["port"]
    implicit_ssl = port == 465
    smtp_cls = smtplib.SMTP_SSL if implicit_ssl else smtplib.SMTP
    with smtp_cls(cfg["host"], port, timeout=30) as server:
        server.ehlo()
        if not implicit_ssl:
            # Upgrade to TLS if configured, or if we need AUTH and the plaintext
            # session doesn't offer it yet but does support STARTTLS.
            need_tls = cfg["tls"] or (cfg["user"] and not server.has_extn("auth"))
            if need_tls and server.has_extn("starttls"):
                server.starttls()
                server.ehlo()
        if cfg["user"]:
            if not server.has_extn("auth"):
                raise RuntimeError(
                    "The SMTP server did not offer the AUTH extension. For Google "
                    "Workspace use host smtp.gmail.com with port 587 and TLS enabled "
                    "(STARTTLS), or port 465 for implicit SSL. If your relay does not "
                    "require a login, clear the SMTP username and password."
                )
            server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from"], recipients, msg.as_string())


def _get_setting(key: str) -> str:
    from ..database import SessionLocal
    from .settings_store import get_setting

    db = SessionLocal()
    try:
        return get_setting(db, key)
    finally:
        db.close()


class SlackChannel(NotificationChannel):
    name = "slack"
    setting_key = "slack_webhook_url"

    def send(self, to: list[str], subject: str, body: str, cc: list[str] | None = None,
             attachments: list[Attachment] | None = None) -> None:
        # Attachments are accepted and dropped: an incoming webhook posts a
        # message, it cannot upload a file. Noted so the caller's contract holds
        # for every channel rather than only for email.
        url = _get_setting(self.setting_key)
        if not url:
            log.info("[slack] no webhook configured; skipping %r", subject)
            return
        text = f"*{subject}*\n{_html_to_text(body)}"
        _post_json(url, {"text": text})


class TeamsChannel(NotificationChannel):
    name = "teams"
    setting_key = "teams_webhook_url"

    def send(self, to: list[str], subject: str, body: str, cc: list[str] | None = None,
             attachments: list[Attachment] | None = None) -> None:
        # As with Slack: a webhook card carries no file.
        url = _get_setting(self.setting_key)
        if not url:
            log.info("[teams] no webhook configured; skipping %r", subject)
            return
        _post_json(url, {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": subject,
            "title": subject,
            "text": _html_to_text(body),
        })


CHANNELS: dict[str, NotificationChannel] = {
    "email": EmailChannel(),
    "slack": SlackChannel(),
    "teams": TeamsChannel(),
}


def get_channel(name: str) -> NotificationChannel | None:
    return CHANNELS.get(name)
