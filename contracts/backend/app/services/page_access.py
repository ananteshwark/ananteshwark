"""Role-based page access ("role admin").

Defines which roles may see each page. SUPER_ADMIN always has access. Admins can
override the defaults per page; the config is stored as a JSON setting. This
gates the UI navigation; individual API endpoints keep their own role checks as
the enforced security boundary.
"""
from __future__ import annotations

import json

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
ROLES = ["ADMIN", "VALIDATOR", "VIEWER", "AUTHOR", "LEGAL", "APPROVER"]

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
    "redline": _AUTHOR, "signatures": _AUTHOR, "reviews": _AUTHOR,
    # Report definitions shape what leadership sees — keep authoring of them tighter.
    "report_builder": ["ADMIN", "VALIDATOR", "LEGAL", "APPROVER"],
    "portfolio": _ALL,
    "ai_governance": _AUTHOR,
    "audit": _ADMIN, "retention": _ADMIN, "settings": _ADMIN,
}


def get_config(db: Session) -> dict[str, list[str]]:
    """Effective page→roles map (defaults merged with any admin override)."""
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


def set_config(db: Session, incoming: dict) -> dict[str, list[str]]:
    """Persist a validated page→roles override (unknown pages/roles dropped)."""
    clean = {}
    for p in PAGES:
        roles = incoming.get(p["key"])
        if isinstance(roles, list):
            clean[p["key"]] = [r for r in roles if r in ROLES]
    set_setting(db, "page_access", json.dumps(clean))
    db.flush()  # make the write visible to the get_config read below
    return get_config(db)


def can_access(db: Session, role: str, key: str) -> bool:
    if role == "SUPER_ADMIN":
        return True
    return role in get_config(db).get(key, [])
