"""Brute-force lockout, now that it lives in the database.

These used to inject a fake clock into a pure in-memory object. The lockout is
a security control and process memory is per worker, so it moved to a table —
which means the behaviour worth testing is the query, not an injectable clock.
Attempts are therefore written with explicit timestamps, which exercises the
real rolling-window filter rather than a substitute for it.

The end-to-end lockout through POST /auth/login is covered in test_r1_hardening;
this file is about the window arithmetic.
"""
from datetime import timedelta

import pytest

from app.database import SessionLocal
from app.models import LoginAttempt, utcnow
from app.services.login_throttle import LoginThrottle

KEY = "throttle-subject@example.com"
OTHER = "throttle-other@example.com"


@pytest.fixture
def db(client):          # client builds the schema via the app's lifespan
    s = SessionLocal()
    s.query(LoginAttempt).filter(LoginAttempt.identity.in_([KEY, OTHER])).delete(
        synchronize_session=False)
    s.commit()
    yield s
    s.query(LoginAttempt).filter(LoginAttempt.identity.in_([KEY, OTHER])).delete(
        synchronize_session=False)
    s.commit()
    s.close()


def _fail(db, key, seconds_ago=0):
    db.add(LoginAttempt(identity=key, at=utcnow() - timedelta(seconds=seconds_ago)))
    db.commit()


class TestWindow:
    def test_not_locked_below_the_limit(self, db):
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        _fail(db, KEY); _fail(db, KEY)
        assert t.retry_after(db, KEY) == 0

    def test_locks_at_the_limit(self, db):
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        for _ in range(3):
            _fail(db, KEY)
        assert t.retry_after(db, KEY) > 0

    def test_an_unknown_identity_is_never_locked(self, db):
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        assert t.retry_after(db, "never-seen@example.com") == 0

    def test_failures_outside_the_window_do_not_count(self, db):
        """The window rolls. Three failures yesterday are not a lockout today —
        otherwise a lockout would be permanent."""
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        for _ in range(3):
            _fail(db, KEY, seconds_ago=1000)
        assert t.retry_after(db, KEY) == 0

    def test_the_lock_releases_as_the_oldest_failure_ages_out(self, db):
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        _fail(db, KEY, seconds_ago=899)     # about to expire
        _fail(db, KEY, seconds_ago=10)
        _fail(db, KEY, seconds_ago=5)
        wait = t.retry_after(db, KEY)
        assert 0 < wait <= 3, f"expected a short remaining wait, got {wait}"

    def test_the_reported_wait_is_bounded_by_the_lockout(self, db):
        t = LoginThrottle(max_attempts=2, lockout_seconds=900)
        _fail(db, KEY); _fail(db, KEY)
        assert 0 < t.retry_after(db, KEY) <= 901


class TestIsolation:
    def test_identities_are_independent(self, db):
        """One person fat-fingering their password must not lock out anyone
        else — including the attacker's real target."""
        t = LoginThrottle(max_attempts=2, lockout_seconds=900)
        _fail(db, KEY); _fail(db, KEY)
        assert t.retry_after(db, KEY) > 0
        assert t.retry_after(db, OTHER) == 0

    def test_a_successful_sign_in_clears_the_record(self, db):
        t = LoginThrottle(max_attempts=2, lockout_seconds=900)
        _fail(db, KEY); _fail(db, KEY)
        assert t.retry_after(db, KEY) > 0
        t.reset(db, KEY)
        assert t.retry_after(db, KEY) == 0


class TestPersistence:
    def test_failures_survive_into_another_session(self, db):
        """The reason this moved out of process memory: another worker — here,
        another session — must see the same failures."""
        t = LoginThrottle(max_attempts=2, lockout_seconds=900)
        t.record_failure(db, KEY)
        t.record_failure(db, KEY)

        other = SessionLocal()
        try:
            assert t.retry_after(other, KEY) > 0
        finally:
            other.close()

    def test_pruning_keeps_the_current_window(self, db):
        """Housekeeping must not delete the evidence of an attack in progress."""
        t = LoginThrottle(max_attempts=3, lockout_seconds=900)
        _fail(db, KEY, seconds_ago=10_000)      # far outside every window
        for _ in range(3):
            t.record_failure(db, KEY)           # each one prunes
        assert t.retry_after(db, KEY) > 0
        remaining = db.query(LoginAttempt).filter(LoginAttempt.identity == KEY).count()
        assert remaining == 3, f"pruning left {remaining} rows, expected the 3 recent ones"
