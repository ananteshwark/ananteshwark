"""Generic OIDC (authorization-code) login against an internal IdP (G11).

Stateless CSRF protection: the `state` is an HMAC-signed timestamp (keyed by the
JWT secret), so the callback can run on any worker without shared session state.
Token exchange / userinfo use httpx and respect the environment proxy. Local
password login always remains available — this is purely additive.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time
from urllib.parse import urlencode

from ..config import settings
from .settings_store import get_setting

_STATE_TTL = 600  # seconds
_SIG_LEN = 16     # bytes of HMAC kept in the state token


class OidcError(Exception):
    pass


def is_enabled(db) -> bool:
    return (get_setting(db, "oidc_enabled") == "true"
            and bool(get_setting(db, "oidc_client_id"))
            and bool(get_setting(db, "oidc_authorization_endpoint"))
            and bool(get_setting(db, "oidc_token_endpoint")))


def _secret() -> bytes:
    return (settings.JWT_SECRET or "oidc-state").encode()


def make_state() -> str:
    payload = str(int(time.time())).encode()
    sig = hmac.new(_secret(), payload, hashlib.sha256).digest()[:_SIG_LEN]
    return base64.urlsafe_b64encode(payload + b"." + sig).decode()


def verify_state(state: str) -> bool:
    """Check a state token minted by make_state.

    The signature is raw bytes, so it contains the separator ".' about 6% of the
    time (1 - (255/256)**16). Splitting on the last "." therefore cut in the
    wrong place on roughly one login in sixteen, and the user was bounced back
    to the sign-in page with an invalid-state error for no reason they could
    see. The signature is a fixed width, so the split is taken by offset — which
    also reads every token the current code already emits, including the ones it
    could not read itself.
    """
    try:
        raw = base64.urlsafe_b64decode(state.encode())
        if len(raw) < _SIG_LEN + 2 or raw[-_SIG_LEN - 1:-_SIG_LEN] != b".":
            return False
        payload, sig = raw[:-_SIG_LEN - 1], raw[-_SIG_LEN:]
        expected = hmac.new(_secret(), payload, hashlib.sha256).digest()[:_SIG_LEN]
        if not hmac.compare_digest(sig, expected):
            return False
        ts = int(payload.decode())
    except (ValueError, TypeError):
        return False
    return 0 <= (time.time() - ts) <= _STATE_TTL


def authorization_url(db, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": get_setting(db, "oidc_client_id"),
        "redirect_uri": get_setting(db, "oidc_redirect_uri"),
        "scope": get_setting(db, "oidc_scopes") or "openid email profile",
        "state": state,
    }
    return f"{get_setting(db, 'oidc_authorization_endpoint')}?{urlencode(params)}"


def exchange_code(db, code: str) -> str:
    """Exchange an authorization code for an access token. Returns the access
    token string."""
    import httpx

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": get_setting(db, "oidc_redirect_uri"),
        "client_id": get_setting(db, "oidc_client_id"),
        "client_secret": get_setting(db, "oidc_client_secret"),
    }
    try:
        resp = httpx.post(get_setting(db, "oidc_token_endpoint"), data=data, timeout=15)
    except Exception as exc:  # network/DNS/TLS
        raise OidcError(f"Token endpoint unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise OidcError(f"Token exchange failed ({resp.status_code})")
    token = resp.json().get("access_token")
    if not token:
        raise OidcError("No access_token in token response")
    return token


def fetch_userinfo(db, access_token: str) -> dict:
    """Fetch the userinfo claims; returns {email, name, email_verified}."""
    import httpx

    try:
        resp = httpx.get(get_setting(db, "oidc_userinfo_endpoint"),
                         headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
    except Exception as exc:
        raise OidcError(f"Userinfo endpoint unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise OidcError(f"Userinfo request failed ({resp.status_code})")
    info = resp.json()
    email = (info.get("email") or info.get("preferred_username") or "").lower()
    if not email:
        raise OidcError("No email claim in userinfo")
    return {"email": email, "name": info.get("name") or email,
            "email_verified": bool(info.get("email_verified", True))}


def decide_access(db, email: str, user_exists: bool) -> tuple[str, str]:
    """('allow'|'provision'|'deny', reason). Mirrors the Google-SSO policy: an
    existing active user is allowed; an unknown user is provisioned only when
    auto-provision is on and (if set) the email domain is allowed."""
    domain = (get_setting(db, "oidc_allowed_domain") or "").strip().lower()
    if domain and not email.endswith("@" + domain):
        return "deny", f"Email domain not allowed (expected @{domain})"
    if user_exists:
        return "allow", ""
    if get_setting(db, "oidc_auto_provision") == "true":
        return "provision", ""
    return "deny", "No account for this user, and auto-provisioning is off"
