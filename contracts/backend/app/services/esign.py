"""Provider-agnostic e-signature layer.

`ESignProvider` is the seam; DocuSign is the first adapter (Adobe/Zoho/NSDL can
be added without touching callers). A `MockProvider` backs tests and lets the
UI work before DocuSign credentials are configured. Credentials live in
server-side settings only, never reaching the client.
"""
from __future__ import annotations

import base64
import json
import logging
import time
import urllib.parse
import urllib.request

from .settings_store import get_setting

log = logging.getLogger(__name__)


class ESignError(Exception):
    pass


class ESignProvider:
    name = "base"

    def create_envelope(self, subject: str, pdf_bytes: bytes, signers: list[dict],
                        options: dict | None = None) -> str:
        raise NotImplementedError

    def get_status(self, external_id: str) -> dict:
        raise NotImplementedError

    def void_envelope(self, external_id: str, reason: str) -> None:
        raise NotImplementedError

    def resend(self, external_id: str) -> None:
        raise NotImplementedError

    def correct(self, external_id: str, options: dict) -> None:
        """Modify an in-flight envelope (reminders/expiration). No-op by default."""
        return None

    def download_signed(self, external_id: str) -> bytes | None:
        return None

    def download_certificate(self, external_id: str) -> bytes | None:
        return None

    def parse_webhook(self, body: bytes, content_type: str) -> dict:
        """Return {external_id, status, recipients:[{email,status}]}."""
        raise NotImplementedError


class MockProvider(ESignProvider):
    """Deterministic in-memory provider. Transitions are driven by posting our
    own JSON to the webhook endpoint, so envelope state changes are testable
    without any external service."""
    name = "mock"
    _counter = 0

    def create_envelope(self, subject, pdf_bytes, signers, options=None):
        MockProvider._counter += 1
        return f"mock-{MockProvider._counter}-{int(time.time())}"

    def get_status(self, external_id):
        return {"status": "SENT"}

    def void_envelope(self, external_id, reason):
        return None

    def resend(self, external_id):
        return None

    def download_signed(self, external_id):
        from .pdf import text_to_pdf
        return text_to_pdf("EXECUTED CONTRACT", f"Signed envelope {external_id}.")

    def download_certificate(self, external_id):
        from .pdf import text_to_pdf
        return text_to_pdf("CERTIFICATE OF COMPLETION",
                           f"Audit trail for envelope {external_id}.")

    def parse_webhook(self, body, content_type):
        data = json.loads(body or b"{}")
        return {
            "external_id": data.get("envelope_id") or data.get("external_id"),
            "status": (data.get("status") or "").upper(),
            "recipients": data.get("recipients", []),
        }


class DocuSignProvider(ESignProvider):
    """DocuSign eSignature REST via OAuth 2.0 JWT grant."""
    name = "docusign"

    def __init__(self, cfg: dict):
        self.base_url = cfg["base_url"].rstrip("/")
        self.account_id = cfg["account_id"]
        self.integration_key = cfg["integration_key"]
        self.user_id = cfg["user_id"]
        self.private_key = cfg["private_key"]
        self.oauth_host = cfg.get("oauth_host", "account-d.docusign.com")
        self._token = None
        self._token_exp = 0

    # -- auth ---------------------------------------------------------------
    def _access_token(self) -> str:
        if self._token and time.time() < self._token_exp - 60:
            return self._token
        import jwt  # PyJWT; required only when DocuSign is the active provider
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": self.integration_key, "sub": self.user_id, "aud": self.oauth_host,
             "iat": now, "exp": now + 3600, "scope": "signature impersonation"},
            self.private_key, algorithm="RS256",
        )
        data = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion,
        }).encode()
        req = urllib.request.Request(f"https://{self.oauth_host}/oauth/token", data=data,
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                tok = json.loads(resp.read())
        except Exception as exc:  # pragma: no cover - network
            raise ESignError(f"DocuSign auth failed: {exc}") from exc
        self._token = tok["access_token"]
        self._token_exp = time.time() + int(tok.get("expires_in", 3600))
        return self._token

    def _api(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = f"{self.base_url}/restapi/v2.1/accounts/{self.account_id}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {self._access_token()}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except Exception as exc:  # pragma: no cover - network
            raise ESignError(f"DocuSign API {method} {path} failed: {exc}") from exc

    @staticmethod
    def _notification(options: dict | None) -> dict | None:
        """Build DocuSign reminders/expiration from the send options (2.7)."""
        if not options:
            return None
        return {
            "useAccountDefaults": "false",
            "reminders": {
                "reminderEnabled": "true" if options.get("reminder_enabled", True) else "false",
                "reminderDelay": str(options.get("reminder_delay_days", 3)),
                "reminderFrequency": str(options.get("reminder_frequency_days", 3)),
            },
            "expirations": {
                "expireEnabled": "true",
                "expireAfter": str(options.get("expire_days", 30)),
                "expireWarn": "0",
            },
        }

    def create_envelope(self, subject, pdf_bytes, signers, options=None):
        # Anchor-tagged signature/date fields pre-populated from register roles.
        sign_tabs = []
        for i, s in enumerate(signers, start=1):
            sign_tabs.append({
                "email": s["email"], "name": s.get("name") or s["email"],
                "recipientId": str(i), "routingOrder": str(s.get("order", i)),
                "roleName": s.get("role", "Signer"),
                "tabs": {
                    "signHereTabs": [{"anchorString": s.get("anchor", "/sig1/"),
                                      "anchorUnits": "pixels", "anchorXOffset": "0", "anchorYOffset": "0"}],
                    "dateSignedTabs": [{"anchorString": s.get("date_anchor", "/date1/"),
                                        "anchorUnits": "pixels"}],
                },
            })
        env = {
            "emailSubject": subject, "status": "sent",
            "documents": [{"documentBase64": base64.b64encode(pdf_bytes).decode(),
                           "name": "contract.pdf", "fileExtension": "pdf", "documentId": "1"}],
            "recipients": {"signers": sign_tabs},
        }
        notification = self._notification(options)
        if notification:
            env["notification"] = notification
        if options and options.get("template_id"):
            # Use a server-side template composited with the generated document.
            env["compositeTemplates"] = [{
                "serverTemplates": [{"sequence": "1", "templateId": options["template_id"]}],
                "inlineTemplates": [{"sequence": "2", "recipients": {"signers": sign_tabs}}],
            }]
        resp = self._api("POST", "/envelopes", env)
        return resp["envelopeId"]

    def correct(self, external_id, options):  # pragma: no cover - network
        notification = self._notification(options)
        if notification:
            self._api("PUT", f"/envelopes/{external_id}", {"notification": notification})

    def get_status(self, external_id):
        return {"status": self._api("GET", f"/envelopes/{external_id}").get("status", "").upper()}

    def void_envelope(self, external_id, reason):
        self._api("PUT", f"/envelopes/{external_id}", {"status": "voided", "voidedReason": reason})

    def resend(self, external_id):
        self._api("PUT", f"/envelopes/{external_id}/recipients?resend_envelope=true", {})

    def download_signed(self, external_id):  # pragma: no cover - network
        url = (f"{self.base_url}/restapi/v2.1/accounts/{self.account_id}"
               f"/envelopes/{external_id}/documents/combined")
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self._access_token()}"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()

    def parse_webhook(self, body, content_type):
        # DocuSign Connect (JSON): {"event": "...", "data": {"envelopeId": ...,
        # "envelopeSummary": {"status": ..., "recipients": {...}}}}
        data = json.loads(body or b"{}")
        summary = (data.get("data") or {}).get("envelopeSummary") or {}
        env_id = (data.get("data") or {}).get("envelopeId") or data.get("envelopeId")
        recips = []
        for r in ((summary.get("recipients") or {}).get("signers") or []):
            recips.append({"email": r.get("email"), "status": (r.get("status") or "").upper()})
        return {"external_id": env_id, "status": (summary.get("status") or "").upper(), "recipients": recips}


# Map DocuSign/native statuses to our EnvelopeStatus values.
STATUS_MAP = {
    "CREATED": "CREATED", "SENT": "SENT", "DELIVERED": "DELIVERED", "VIEWED": "VIEWED",
    "SIGNED": "SIGNED", "COMPLETED": "COMPLETED", "DECLINED": "DECLINED", "VOIDED": "VOIDED",
}


def verify_webhook(db, body: bytes, headers) -> bool:
    """Verify a provider webhook's authenticity.

    DocuSign Connect signs the raw body with HMAC‑SHA256 (base64) in the
    `X-DocuSign-Signature-1` header when an HMAC key is configured. When a
    `docusign_webhook_secret` is set we require a valid signature; when it is
    empty (or the provider is the mock) we accept (dev/demo). Returns True if the
    request should be trusted.
    """
    import base64
    import hashlib
    import hmac

    which = (get_setting(db, "esign_provider") or "mock").lower()
    if which != "docusign":
        return True
    secret = get_setting(db, "docusign_webhook_secret") or ""
    if not secret:
        return True  # no HMAC configured — nothing to verify against
    expected = base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode()
    # DocuSign may send several numbered signature headers; any match is valid.
    for i in range(1, 6):
        got = headers.get(f"x-docusign-signature-{i}") or headers.get(f"X-DocuSign-Signature-{i}")
        if got and hmac.compare_digest(got.strip(), expected):
            return True
    return False


def get_provider(db) -> ESignProvider:
    which = (get_setting(db, "esign_provider") or "mock").lower()
    if which == "docusign":
        cfg = {
            "base_url": get_setting(db, "docusign_base_url") or "https://demo.docusign.net",
            "account_id": get_setting(db, "docusign_account_id"),
            "integration_key": get_setting(db, "docusign_integration_key"),
            "user_id": get_setting(db, "docusign_user_id"),
            "private_key": get_setting(db, "docusign_private_key"),
            "oauth_host": get_setting(db, "docusign_oauth_host") or "account-d.docusign.com",
        }
        if not all([cfg["account_id"], cfg["integration_key"], cfg["user_id"], cfg["private_key"]]):
            raise ESignError("DocuSign is selected but its credentials are not fully configured.")
        return DocuSignProvider(cfg)
    return MockProvider()


def build_final_pdf(draft, signers: list[dict] | None = None, db=None) -> bytes:
    """Render the frozen draft to a PDF for signing, emitting one anchor block per
    configured signer so every signer's tabs bind (not just the first two).

    With a session, the document is rendered on the business unit's letterhead —
    this is the copy the counterparty signs, so it is the one that most needs to
    be on the right entity's paper. ``db`` is optional so the pure-rendering
    tests can call this without a database.
    """
    from .authoring import render_text
    from .letterhead import spec_for_draft
    from .pdf import text_to_pdf
    body = render_text(draft.document, draft.fields or {})
    body += "\n\nIN WITNESS WHEREOF the parties have executed this Agreement.\n\n"
    if signers:
        for i, s in enumerate(signers, start=1):
            label = s.get("name") or s.get("role") or s.get("email") or f"Signatory {i}"
            body += f"{label}: {s.get('anchor', f'/sig{i}/')}    Date: {s.get('date_anchor', f'/date{i}/')}\n\n"
    else:
        body += "Company: /sig1/    Date: /date1/\n\nVendor: /sig2/    Date: /date2/\n"
    return text_to_pdf((draft.title or "CONTRACT").upper(), body,
                       letterhead=spec_for_draft(db, draft) if db is not None else None)
