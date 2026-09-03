"""Role-based page access ("role admin").

Defines which roles may see each page. SUPER_ADMIN always has access. Admins can
override the defaults per page; the config is stored as a JSON setting.

This gates the UI navigation *and*, via auth.require_page, the API routers
behind each page. It used to gate only the navigation — can_access() had no
callers at all — so removing a page from a role hid the link and left every
endpoint reachable. An admin who took Audit Log away from validators had no way
to know the setting did nothing.

The gate only ever *restricts*: it is applied on top of each endpoint's own
role dependency, never instead of it. Granting a page to a role therefore
cannot let that role past a check it would otherwise fail, so a mis-click in the
page editor can widen the navigation but never the security boundary.
"""
from __future__ import annotations

import json
import time

from sqlalchemy.orm import Session

from .settings_store import get_setting, set_setting

# Canonical page catalogue (key -> label) shown in the admin editor and the nav.
PAGES: list[dict] = [
    {"key": "dashboard", "label": "Dashboard"},
    {"key": "ingestion", "label": "Ingestion Log"},
    {"key": "validation", "label": "Validation Queue"},
    {"key": "duplicates", "label": "Duplicate Review"},
    {"key": "contracts", "label": "Contracts"},
    {"key": "repository_ai", "label": "Repository AI"},
    {"key": "obligations", "label": "Obligations"},
    {"key": "requests", "label": "Contract Requests"},
    {"key": "tasks", "label": "My Tasks"},
    {"key": "authoring", "label": "Author contract"},
    {"key": "drafts", "label": "Drafting Queue"},
    {"key": "reviews", "label": "Reviews"},
    {"key": "templates", "label": "Templates"},
    {"key": "clauses", "label": "Clause Library"},
    {"key": "redline", "label": "Redline Inbox"},
    {"key": "signatures", "label": "Signatures"},
    {"key": "vendors", "label": "Vendors"},
    {"key": "rules", "label": "Reminder Rules"},
    {"key": "portfolio", "label": "Portfolio Intelligence"},
    {"key": "reports", "label": "Reports"},
    {"key": "ai_governance", "label": "AI Governance"},
    {"key": "report_builder", "label": "Report Builder"},
    {"key": "audit", "label": "Audit Log"},
    {"key": "retention", "label": "Data Retention"},
    {"key": "settings", "label": "Admin Settings"},
]

# Assignable roles (SUPER_ADMIN is implicit — always allowed).
ROLES = ["ADMIN", "VALIDATOR", "VIEWER", "AUTHOR", "LEGAL", "APPROVER", "REQUESTER"]

_ALL = ROLES
_AUTHOR = ["ADMIN", "VALIDATOR", "AUTHOR", "LEGAL", "APPROVER"]
_ADMIN = ["ADMIN"]

DEFAULT_ACCESS: dict[str, list[str]] = {
    "dashboard": _ALL, "ingestion": _ALL, "validation": _ALL, "duplicates": _ALL,
    "contracts": _ALL, "vendors": _ALL, "rules": _ALL, "reports": _ALL,
    # Everyone can raise a request, track their own tasks, and search the
    # repository; obligations are read-only for viewers via the page's own RBAC.
    "requests": _ALL, "tasks": _ALL, "obligations": _ALL, "repository_ai": _ALL,
    "authoring": _AUTHOR, "drafts": _AUTHOR, "templates": _AUTHOR, "clauses": _AUTHOR,
    "redline": _AUTHOR, "signatures": _AUTHOR,
    # Anyone can be asked to review a draft, so anyone may need the Reviews page
    # — it only ever shows the threads they are personally tagged in.
    "reviews": _ALL,
    # Report definitions shape what leadership sees — keep authoring of them tighter.
    "report_builder": ["ADMIN", "VALIDATOR", "LEGAL", "APPROVER"],
    "portfolio": _ALL,
    "ai_governance": _AUTHOR,
    "audit": _ADMIN, "retention": _ADMIN, "settings": _ADMIN,
}


def _read_config(db: Session) -> dict[str, list[str]]:
    override: dict = {}
    raw = get_setting(db, "page_access")
    if raw:
        try:
            override = json.loads(raw)
        except Exception:
            override = {}
    cfg = {}
    for p in PAGES:
        val = override.get(p["key"])
        cfg[p["key"]] = [r for r in val if r in ROLES] if isinstance(val, list) else list(DEFAULT_ACCESS[p["key"]])
    return cfg


# Now that require_page consults this on every gated request, an uncached read
# would add a settings SELECT to every API call in the product. The config is
# edited by hand from one admin screen, so a short TTL plus explicit
# invalidation on write costs nothing and keeps a saved change effectively
# immediate (and correct across workers within the TTL).
_CACHE_TTL = 30.0
_cache: dict[str, list[str]] | None = None
_cache_at = 0.0


def invalidate_cache() -> None:
    global _cache, _cache_at
    _cache, _cache_at = None, 0.0


def get_config(db: Session, *, cached: bool = False) -> dict[str, list[str]]:
    """Effective page→roles map (defaults merged with any admin override).

    `cached=True` is for the per-request access check; the admin editor reads
    it uncached so a save is always reflected immediately in its own response.
    """
    global _cache, _cache_at
    if not cached:
        return _read_config(db)
    now = time.monotonic()
    if _cache is None or now - _cache_at > _CACHE_TTL:
        _cache, _cache_at = _read_config(db), now
    return _cache


def set_config(db: Session, incoming: dict) -> dict[str, list[str]]:
    """Persist a validated page→roles override (unknown pages/roles dropped)."""
    clean = {}
    for p in PAGES:
        roles = incoming.get(p["key"])
        if isinstance(roles, list):
            clean[p["key"]] = [r for r in roles if r in ROLES]
    set_setting(db, "page_access", json.dumps(clean))
    db.flush()  # make the write visible to the get_config read below
    invalidate_cache()
    return get_config(db)


def can_access(db: Session, roles: set[str] | str, key: str) -> bool:
    """Whether any of `roles` may reach `key`.

    Takes the user's full role set, not a single role: users hold a primary
    role plus extra_roles, and checking only the primary would deny a
    VIEWER+LEGAL user pages their LEGAL role grants.
    """
    held = {roles} if isinstance(roles, str) else set(roles)
    if "SUPER_ADMIN" in held:
        return True
    return not held.isdisjoint(get_config(db, cached=True).get(key, []))
