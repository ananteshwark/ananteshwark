"""Tiny in-process sliding-window rate limiter (no Redis dependency).

Used to throttle the unauthenticated vendor endpoints — a burst guard, not a
lockout. Deliberately still in process memory, unlike the sign-in lockout next
door in login_throttle, which moved to the database:

  * The sign-in lockout is a security control with tiny volume, and being
    per-process made it wrong — N workers meant N times the attempts.
  * This one fires on every vendor request. Moving it to the database would
    turn each one into a write, which hands an attacker a way to make the
    server do database work by flooding it: the limiter would amplify the
    flood it exists to absorb.

Per-process here means N workers allow N times the burst. That is a looser
bound, not a broken one, and it is the right trade for the request path. If
this ever needs to be exact across workers, it wants a shared counter store
(Redis), not a table.
"""
import threading
import time

_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
_MAX_KEYS = 10_000


def allow(key: str, max_hits: int, window_s: float) -> bool:
    """Record a hit for `key`; return False if it exceeds `max_hits` in the window."""
    now = time.time()
    with _lock:
        arr = [t for t in _hits.get(key, []) if now - t < window_s]
        arr.append(now)
        _hits[key] = arr
        if len(_hits) > _MAX_KEYS:  # crude eviction to bound memory
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > window_s][:1000]:
                _hits.pop(k, None)
        return len(arr) <= max_hits
