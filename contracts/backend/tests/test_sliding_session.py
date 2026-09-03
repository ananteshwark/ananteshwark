"""The session slides so a short token life is survivable.

JWT_EXPIRY_MINUTES is 60 because the token sits in localStorage: whatever can
read it holds a working session for exactly that long. Sixty minutes with no
renewal would mean being thrown to the login screen mid-draft every hour, so
any request made in the second half of a token's life comes back with a
replacement and the client swaps it in.

Both halves matter and are tested here. Never refreshing makes the short expiry
unusable; refreshing on every request makes the expiry meaningless, because a
token would live forever as long as anything ever touched it once.
"""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth import REFRESH_HEADER
from app.config import settings


def _token_for(email, minutes_remaining):
    """A token for `email` that expires in `minutes_remaining` minutes."""
    from app.database import SessionLocal
    from app.models import User
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    assert user is not None, email
    payload = {
        "sub": str(user.id), "email": user.email, "role": user.role.value,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes_remaining),
    }
    db.close()
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


class TestSliding:
    def test_a_fresh_token_is_not_replaced(self, client, admin_headers):
        """Refreshing on every request would make the expiry decorative."""
        r = client.get("/api/contracts/validation-queue", headers=admin_headers)
        assert r.status_code == 200
        assert REFRESH_HEADER not in r.headers

    def test_a_token_past_halfway_is_replaced(self, client, admin_headers):
        stale = _token_for("admin@example.com", minutes_remaining=5)
        r = client.get("/api/contracts/validation-queue", headers=_headers(stale))
        assert r.status_code == 200
        assert REFRESH_HEADER in r.headers, "no replacement token was issued"

    def test_the_replacement_is_a_working_token_with_a_full_life(self, client):
        stale = _token_for("admin@example.com", minutes_remaining=5)
        r = client.get("/api/contracts/validation-queue", headers=_headers(stale))
        new = r.headers[REFRESH_HEADER]

        payload = jwt.decode(new, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        remaining = payload["exp"] - datetime.now(timezone.utc).timestamp()
        assert remaining > (settings.JWT_EXPIRY_MINUTES * 60) * 0.9

        # And it actually authenticates.
        assert client.get("/api/contracts/validation-queue",
                          headers=_headers(new)).status_code == 200

    def test_the_replacement_is_for_the_same_user(self, client):
        """A refresh must never widen who you are."""
        stale = _token_for("admin@example.com", minutes_remaining=5)
        r = client.get("/api/contracts/validation-queue", headers=_headers(stale))
        payload = jwt.decode(r.headers[REFRESH_HEADER], settings.JWT_SECRET,
                             algorithms=[settings.JWT_ALGORITHM])
        assert payload["email"] == "admin@example.com"


class TestExpiryStillBites:
    def test_an_expired_token_is_refused_not_refreshed(self, client):
        """The whole point of the short expiry. A token that has already lapsed
        must not be renewable — otherwise a stolen one never dies."""
        dead = _token_for("admin@example.com", minutes_remaining=-1)
        r = client.get("/api/contracts/validation-queue", headers=_headers(dead))
        assert r.status_code == 401
        assert REFRESH_HEADER not in r.headers

    def test_a_forged_token_is_refused(self, client):
        forged = jwt.encode(
            {"sub": "1", "email": "admin@example.com", "role": "ADMIN",
             "exp": datetime.now(timezone.utc) + timedelta(minutes=60)},
            "not-the-real-signing-secret-but-long-enough-for-sha256", algorithm="HS256",
        )
        r = client.get("/api/contracts/validation-queue", headers=_headers(forged))
        assert r.status_code == 401
        assert REFRESH_HEADER not in r.headers


class TestConfiguration:
    def test_the_default_expiry_is_short(self):
        """If this is ever lengthened back to a working day, the reason the
        token can live in localStorage at all goes with it."""
        assert settings.JWT_EXPIRY_MINUTES <= 120

    @pytest.mark.parametrize("path", [
        "/api/contracts/validation-queue",
        "/api/vendors",
        "/api/settings",
    ])
    def test_sliding_works_through_any_role_gate(self, client, path):
        """get_current_user is reached through require_viewer / require_admin
        and friends, not only directly — the refresh has to survive that."""
        stale = _token_for("admin@example.com", minutes_remaining=5)
        r = client.get(path, headers=_headers(stale))
        assert r.status_code == 200, r.text
        assert REFRESH_HEADER in r.headers, f"{path} did not slide the session"
