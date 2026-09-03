"""Brute-force lockout for sign-in, backed by the database.

This used to be a dict in process memory. That is wrong for a security control
the moment there is more than one worker: each process keeps its own count, so
N workers give an attacker N times the allowance, and the worker that answers
the next attempt may not be the one that saw the failures. A restart also
forgot an attack that was in progress.

The window is rolling, so the state is the failure times themselves — one row
per failed attempt, counted over the window. The volume is negligible by
construction: successful sign-ins delete their rows, and failures are capped.

Scope note, because this is easy to over-claim: moving the lockout here removes
one obstacle to running several workers, but not the others. The scheduler and
the file watcher still assume a single process, so this does not by itself make
the app safe to scale out.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from ..config import settings
from ..models import LoginAttempt, utcnow

log = logging.getLogger(__name__)


class LoginThrottle:
    def __init__(self, max_attempts: int, lockout_seconds: int):
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds

    def _window_start(self):
        return utcnow() - timedelta(seconds=self.lockout_seconds)

    def _failures(self, db: Session, key: str) -> list:
        return (
            db.query(LoginAttempt)
            .filter(LoginAttempt.identity == key, LoginAttempt.at >= self._window_start())
            .order_by(LoginAttempt.at)
            .all()
        )

    def retry_after(self, db: Session, key: str) -> int:
        """Seconds the caller must wait, or 0 if not locked out."""
        rows = self._failures(db, key)
        if len(rows) < self.max_attempts:
            return 0
        # Locked until the oldest failure in the window ages out.
        oldest = rows[0].at
        if oldest.tzinfo is None:                       # SQLite hands back naive
            oldest = oldest.replace(tzinfo=utcnow().tzinfo)
        elapsed = (utcnow() - oldest).total_seconds()
        return max(1, int(self.lockout_seconds - elapsed) + 1)

    def record_failure(self, db: Session, key: str) -> None:
        db.add(LoginAttempt(identity=key, at=utcnow()))
        # Committed here rather than left to the caller: the request this
        # belongs to ends in an HTTPException, and an uncommitted failure is a
        # failure that never happened.
        db.commit()
        self._prune(db)

    def reset(self, db: Session, key: str) -> None:
        """Clear the record after a successful sign-in."""
        db.query(LoginAttempt).filter(LoginAttempt.identity == key).delete(
            synchronize_session=False)
        db.commit()

    def _prune(self, db: Session) -> None:
        """Drop attempts that have aged out of every window.

        Housekeeping on the failure path, which is the only path that grows the
        table, and best-effort: losing a prune costs a few stale rows, while
        letting it raise would turn a cleanup into a failed login.
        """
        try:
            cutoff = utcnow() - timedelta(seconds=self.lockout_seconds * 4)
            db.query(LoginAttempt).filter(LoginAttempt.at < cutoff).delete(
                synchronize_session=False)
            db.commit()
        except Exception:
            log.warning("Could not prune old login attempts", exc_info=True)
            db.rollback()


throttle = LoginThrottle(settings.LOGIN_MAX_ATTEMPTS, settings.LOGIN_LOCKOUT_MINUTES * 60)
