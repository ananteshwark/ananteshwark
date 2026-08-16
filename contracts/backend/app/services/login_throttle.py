"""In-memory login throttle (rolling window) to slow brute-force attempts.

Single-instance appropriate (the app runs one worker with background services).
Pure and clock-injectable for testing.
"""
import threading
import time

from ..config import settings


class LoginThrottle:
    def __init__(self, max_attempts: int, lockout_seconds: int):
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> list[float]:
        window = [t for t in self._failures.get(key, []) if now - t < self.lockout_seconds]
        if window:
            self._failures[key] = window
        else:
            self._failures.pop(key, None)
        return window

    def retry_after(self, key: str, now: float | None = None) -> int:
        """Seconds the caller must wait, or 0 if not locked."""
        now = time.time() if now is None else now
        with self._lock:
            window = self._prune(key, now)
            if len(window) >= self.max_attempts:
                return int(self.lockout_seconds - (now - min(window))) + 1
            return 0

    def record_failure(self, key: str, now: float | None = None) -> None:
        now = time.time() if now is None else now
        with self._lock:
            window = self._prune(key, now)
            window.append(now)
            self._failures[key] = window

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


throttle = LoginThrottle(settings.LOGIN_MAX_ATTEMPTS, settings.LOGIN_LOCKOUT_MINUTES * 60)
