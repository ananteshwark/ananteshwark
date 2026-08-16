"""In-process request metrics for observability (no external dependency).

Tracks per-route request counts, latency and error counts, plus process uptime.
Exposed via GET /api/metrics (admin) and surfaced as an X-Response-Time-ms header.
Deliberately lightweight and memory-bounded so it is safe on the air-gapped box.
"""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

_START = time.time()
_lock = Lock()

# route -> {"count", "errors", "total_ms", "max_ms"}
_routes: dict[str, dict] = defaultdict(lambda: {"count": 0, "errors": 0, "total_ms": 0.0, "max_ms": 0.0})
_status: dict[int, int] = defaultdict(int)


def record(route: str, status_code: int, elapsed_ms: float) -> None:
    with _lock:
        r = _routes[route]
        r["count"] += 1
        r["total_ms"] += elapsed_ms
        r["max_ms"] = max(r["max_ms"], elapsed_ms)
        if status_code >= 500:
            r["errors"] += 1
        _status[status_code] += 1


def snapshot() -> dict:
    with _lock:
        routes = []
        total_requests = 0
        total_errors = 0
        for route, r in sorted(_routes.items(), key=lambda kv: -kv[1]["count"]):
            total_requests += r["count"]
            total_errors += r["errors"]
            routes.append({
                "route": route, "count": r["count"], "errors": r["errors"],
                "avg_ms": round(r["total_ms"] / r["count"], 1) if r["count"] else 0.0,
                "max_ms": round(r["max_ms"], 1),
            })
        return {
            "uptime_seconds": round(time.time() - _START, 1),
            "total_requests": total_requests,
            "total_errors": total_errors,
            "status_codes": dict(_status),
            "routes": routes[:50],
        }


def reset() -> None:  # for tests
    with _lock:
        _routes.clear()
        _status.clear()
