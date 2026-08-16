"""Tiny in-process sliding-window rate limiter (no Redis dependency).

Used to throttle the unauthenticated vendor endpoints. Not distributed — fine
for the single-process deployment; swap for a shared store if scaled out.
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
