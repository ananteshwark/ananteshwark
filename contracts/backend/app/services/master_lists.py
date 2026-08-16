"""Admin-managed pick lists (currencies, business units) used by the contract
forms. Stored as JSON settings so admins can extend them without a deploy."""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from .settings_store import get_setting, set_setting

# Sensible starting values; admins add more from the Admin Settings page.
DEFAULT_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "SGD", "AED", "CAD"]
DEFAULT_BUSINESS_UNITS: list[str] = []

_KEYS = {
    "currencies": ("master_currencies", DEFAULT_CURRENCIES),
    "business_units": ("master_business_units", DEFAULT_BUSINESS_UNITS),
}


def _load(db: Session, key: str) -> list[str]:
    setting_key, default = _KEYS[key]
    raw = get_setting(db, setting_key)
    if not raw:
        return list(default)
    try:
        vals = json.loads(raw)
    except Exception:
        return list(default)
    return [str(v).strip() for v in vals if str(v).strip()] if isinstance(vals, list) else list(default)


def _save(db: Session, key: str, values) -> list[str]:
    setting_key, _ = _KEYS[key]
    clean, seen = [], set()
    for v in values or []:
        s = str(v).strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            clean.append(s)
    set_setting(db, setting_key, json.dumps(clean))
    return clean


def get_lists(db: Session) -> dict[str, list[str]]:
    return {"currencies": _load(db, "currencies"), "business_units": _load(db, "business_units")}


def set_lists(db: Session, incoming: dict) -> dict[str, list[str]]:
    out = {}
    for key in _KEYS:
        if isinstance(incoming.get(key), list):
            out[key] = _save(db, key, incoming[key])
        else:
            out[key] = _load(db, key)
    db.flush()
    return out
