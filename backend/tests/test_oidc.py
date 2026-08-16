"""E1/G11 — on-prem SSO via generic OIDC (state signing, config, callback)."""
import uuid


def _enable_oidc(client, admin_headers, auto_provision=False, allowed_domain=""):
    client.put("/api/settings", headers=admin_headers, json={"values": {
        "oidc_enabled": "true", "oidc_client_id": "cms-app",
        "oidc_authorization_endpoint": "https://idp.internal/authorize",
        "oidc_token_endpoint": "https://idp.internal/token",
        "oidc_userinfo_endpoint": "https://idp.internal/userinfo",
        "oidc_redirect_uri": "https://cms.internal/api/auth/oidc/callback",
        "oidc_auto_provision": "true" if auto_provision else "false",
        "oidc_allowed_domain": allowed_domain, "oidc_default_role": "VIEWER",
    }})


def _disable(client, admin_headers):
    client.put("/api/settings", headers=admin_headers, json={"values": {"oidc_enabled": "false"}})


def test_state_signing_roundtrip():
    from app.services import oidc
    s = oidc.make_state()
    assert oidc.verify_state(s) is True
    assert oidc.verify_state(s + "tamper") is False
    assert oidc.verify_state("garbage") is False


def test_state_verifies_when_the_signature_contains_the_separator():
    """The signature is raw bytes and contains "." about 6% of the time, so
    splitting on the last "." rejected roughly one valid login in sixteen. This
    pins the case down deterministically instead of leaving it to the clock."""
    import base64
    import hashlib
    import hmac
    import time

    from app.services import oidc

    now = int(time.time())
    for offset in range(oidc._STATE_TTL):
        payload = str(now - offset).encode()
        sig = hmac.new(oidc._secret(), payload, hashlib.sha256).digest()[:oidc._SIG_LEN]
        if b"." in sig:
            state = base64.urlsafe_b64encode(payload + b"." + sig).decode()
            assert oidc.verify_state(state) is True, (
                "a valid state whose signature contains the separator was rejected")
            return
    raise AssertionError("no colliding signature found in the TTL window")


def test_oidc_config_and_login_url(client, admin_headers):
    assert client.get("/api/auth/oidc/config").json()["oidc_enabled"] is False
    _enable_oidc(client, admin_headers)
    try:
        cfg = client.get("/api/auth/oidc/config").json()
        assert cfg["oidc_enabled"] is True and cfg["button_label"]
        url = client.get("/api/auth/oidc/login").json()["authorization_url"]
        assert url.startswith("https://idp.internal/authorize?")
        assert "client_id=cms-app" in url and "state=" in url and "response_type=code" in url
    finally:
        _disable(client, admin_headers)


def test_callback_logs_in_existing_user(client, admin_headers, monkeypatch):
    from app.database import SessionLocal
    from app.models import User, UserRole
    from app.auth import hash_password
    from app.services import oidc
    email = f"sso-{uuid.uuid4().hex[:6]}@corp.test"
    db = SessionLocal()
    db.add(User(email=email, name="SSO User", role=UserRole.VIEWER,
                hashed_password=hash_password("x"))); db.commit(); db.close()

    _enable_oidc(client, admin_headers)
    monkeypatch.setattr(oidc, "exchange_code", lambda db, code: "tok")
    monkeypatch.setattr(oidc, "fetch_userinfo", lambda db, tok: {"email": email, "name": "SSO User", "email_verified": True})
    try:
        state = oidc.make_state()
        r = client.get(f"/api/auth/oidc/callback?code=abc&state={state}", follow_redirects=False)
        assert r.status_code == 302
        assert "sso_token=" in r.headers["location"]
    finally:
        _disable(client, admin_headers)


def test_callback_denies_unknown_without_provision(client, admin_headers, monkeypatch):
    from app.services import oidc
    _enable_oidc(client, admin_headers, auto_provision=False)
    monkeypatch.setattr(oidc, "exchange_code", lambda db, code: "tok")
    monkeypatch.setattr(oidc, "fetch_userinfo", lambda db, tok: {"email": "nobody@corp.test", "name": "N", "email_verified": True})
    try:
        state = oidc.make_state()
        r = client.get(f"/api/auth/oidc/callback?code=abc&state={state}", follow_redirects=False)
        assert r.status_code == 403
    finally:
        _disable(client, admin_headers)


def test_callback_provisions_when_enabled(client, admin_headers, monkeypatch):
    from app.services import oidc
    email = f"new-{uuid.uuid4().hex[:6]}@corp.test"
    _enable_oidc(client, admin_headers, auto_provision=True, allowed_domain="corp.test")
    monkeypatch.setattr(oidc, "exchange_code", lambda db, code: "tok")
    monkeypatch.setattr(oidc, "fetch_userinfo", lambda db, tok: {"email": email, "name": "New", "email_verified": True})
    try:
        state = oidc.make_state()
        r = client.get(f"/api/auth/oidc/callback?code=abc&state={state}", follow_redirects=False)
        assert r.status_code == 302
    finally:
        _disable(client, admin_headers)


def test_invalid_state_rejected(client, admin_headers, monkeypatch):
    from app.services import oidc
    _enable_oidc(client, admin_headers)
    monkeypatch.setattr(oidc, "exchange_code", lambda db, code: "tok")
    try:
        r = client.get("/api/auth/oidc/callback?code=abc&state=bad", follow_redirects=False)
        assert r.status_code == 400
    finally:
        _disable(client, admin_headers)
