"""Multi-currency normalization (G15). Rates are admin-entered (offline): each
FxRate says how many units of the base currency one unit of `currency` is worth.
The base currency itself is always 1.0."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import FxRate
from .settings_store import get_setting


def base_currency(db: Session) -> str:
    return (get_setting(db, "base_currency") or "INR").strip() or "INR"


def rate_map(db: Session) -> dict[str, float]:
    """currency -> rate_to_base, including the base currency at 1.0."""
    rates = {r.currency: float(r.rate_to_base) for r in db.query(FxRate).all()}
    rates[base_currency(db)] = 1.0
    return rates


def to_base(amount: float | None, currency: str | None, rates: dict[str, float]) -> float | None:
    """Convert an amount to the base currency. Returns None if the amount is None
    or the currency has no known rate (so callers can flag unconvertible value)."""
    if amount is None:
        return None
    rate = rates.get((currency or "").strip())
    if rate is None:
        return None
    return round(float(amount) * rate, 2)
