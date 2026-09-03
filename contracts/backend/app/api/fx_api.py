"""FX rate administration + portfolio value normalization (G15)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import Contract, ContractStatus, FxRate, User
from ..services.fx import base_currency, rate_map, to_base

router = APIRouter(prefix="/fx", tags=["fx"])


class RateIn(BaseModel):
    currency: str
    rate_to_base: float


@router.get("/rates")
def list_rates(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    base = base_currency(db)
    rows = db.query(FxRate).order_by(FxRate.currency).all()
    return {"base_currency": base,
            "rates": [{"currency": r.currency, "rate_to_base": float(r.rate_to_base),
                       "updated_at": r.updated_at.isoformat() if r.updated_at else None}
                      for r in rows]}


@router.put("/rates")
def upsert_rate(payload: RateIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    cur = (payload.currency or "").strip().upper()
    if not cur:
        raise HTTPException(400, "currency is required")
    if payload.rate_to_base <= 0:
        raise HTTPException(400, "rate_to_base must be positive")
    row = db.query(FxRate).filter(FxRate.currency == cur).first()
    if row is None:
        row = FxRate(currency=cur, rate_to_base=payload.rate_to_base)
        db.add(row)
    else:
        row.rate_to_base = payload.rate_to_base
    log_action(db, "fx_rate", 0, "UPSERT", user_id=user.id, field=cur, new_value=str(payload.rate_to_base))
    db.commit()
    return {"currency": cur, "rate_to_base": float(row.rate_to_base)}


@router.delete("/rates/{currency}")
def delete_rate(currency: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.query(FxRate).filter(FxRate.currency == currency.strip().upper()).first()
    if row is None:
        raise HTTPException(404, "Rate not found")
    db.delete(row)
    log_action(db, "fx_rate", 0, "DELETE", user_id=user.id, field=currency)
    db.commit()
    return {"ok": True}


@router.get("/portfolio-value")
def portfolio_value(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Total value of active contracts normalized to the base currency, plus the
    per-currency breakdown and any value that couldn't be converted (missing rate)."""
    base = base_currency(db)
    rates = rate_map(db)
    rows = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None),
                Contract.contract_value.isnot(None))
        .all()
    )
    per_currency: dict[str, float] = {}
    total_base = 0.0
    unconvertible: dict[str, float] = {}
    for c in rows:
        cur = c.currency or base
        val = float(c.contract_value)
        per_currency[cur] = per_currency.get(cur, 0.0) + val
        converted = to_base(val, cur, rates)
        if converted is None:
            unconvertible[cur] = unconvertible.get(cur, 0.0) + val
        else:
            total_base += converted
    return {
        "base_currency": base,
        "total_in_base": round(total_base, 2),
        "by_currency": [{"currency": k, "total": round(v, 2),
                         "rate": rates.get(k), "in_base": to_base(v, k, rates)}
                        for k, v in sorted(per_currency.items())],
        "unconvertible": [{"currency": k, "total": round(v, 2)} for k, v in sorted(unconvertible.items())],
    }
