"""Google Sign-In (OAuth ID-token) authentication for app users.

The frontend uses Google Identity Services to obtain an ID token (a signed JWT),
POSTs it to the backend, and the backend verifies it against the configured
Google OAuth client ID, then matches or provisions a CMS user by verified email.

Access policy (see `decide_google_access`, unit-tested):
  - Email must be verified by Google.
  - If an allowed domain is configured, the email must be in that domain.
  - Existing users sign in.
  - Unknown emails are provisioned only when auto-provision is on AND an allowed
    domain is configured (so a bare Google account can't self-register).
"""
import logging

log = logging.getLogger(__name__)


class GoogleAuthError(Exception):
    pass


def decide_google_access(
    email: str,
    email_verified: bool,
    user_exists: bool,
    *,
    allowed_domain: str,
    auto_provision: bool,
) -> tuple[str, str]:
    """Return (decision, reason) where decision is 'allow' | 'provision' | 'deny'."""
    if not email:
        return ("deny", "Google account did not provide an email")
    if not email_verified:
        return ("deny", "Google has not verified this email address")
    domain = email.split("@")[-1].lower() if "@" in email else ""
    allowed_domain = (allowed_domain or "").strip().lstrip("@").lower()
    if allowed_domain and domain != allowed_domain:
        return ("deny", f"Only {allowed_domain} accounts may sign in")
    if user_exists:
        return ("allow", "")
    if auto_provision and allowed_domain:
        return ("provision", "")
    return ("deny", "No account exists for this email — contact an administrator")


def verify_google_id_token(credential: str, client_id: str) -> dict:
    """Verify a Google ID token against `client_id`; return the token claims.

    Raises GoogleAuthError on any invalid/expired token or audience mismatch.
    """
    if not client_id:
        raise GoogleAuthError("Google client ID is not configured")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:  # google-auth is in requirements; guard anyway
        raise GoogleAuthError("google-auth is not installed") from exc
    try:
        info = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError as exc:
        raise GoogleAuthError(f"Invalid Google token: {exc}") from exc
    return info
