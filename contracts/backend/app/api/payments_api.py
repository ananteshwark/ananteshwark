"""Payment schedules & spend (G12): per-contract payment/billing lines tracked
scheduled → invoiced → paid, plus a portfolio spend summary (spend-under-
management, outstanding, paid, and negotiated savings)."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import (
    Contract,
    ContractStatus,
    PaymentScheduleItem,
    PaymentStatus,
    User,
)

router = APIRouter(prefix="/payments", tags=["payments"])


class PaymentIn(BaseModel):
    contract_id: int
    description: str | None = None
    due_date: date | None = None
    amount: float | None = None
    currency: str | None = None
    po_reference: str | None = None
    invoice_reference: str | None = None
    status: str | None = None


class PaymentUpdate(BaseModel):
    description: str | None = None
    due_date: date | None = None
    amount: float | None = None
    currency: str | None = None
    po_reference: str | None = None
    invoice_reference: str | None = None
    status: str | None = None
    paid_date: date | None = None


def _out(p: PaymentScheduleItem) -> dict:
    return {
        "id": p.id, "contract_id": p.contract_id, "description": p.description,
        "due_date": p.due_date.isoformat() if p.due_date else None,
        "amount": float(p.amount) if p.amount is not None else None,
        "currency": p.currency, "po_reference": p.po_reference,
        "invoice_reference": p.invoice_reference, "status": p.status.value,
        "paid_date": p.paid_date.isoformat() if p.paid_date else None,
        "overdue": bool(p.status != PaymentStatus.PAID and p.due_date and p.due_date < date.today()),
    }


def _contract(db: Session, sr_no: int, *, for_write: bool = False) -> Contract:
    c = db.get(Contract, sr_no)
    if c is None or c.deleted_at is not None:
        raise HTTPException(404, "Contract not found")
    # A held contract's financial record is part of what the hold preserves.
    if for_write and c.legal_hold:
        raise HTTPException(423, "Contract is under legal hold and cannot be modified. "
                                 "Release the hold first.")
    return c


@router.get("")
def list_payments(contract_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    rows = (
        db.query(PaymentScheduleItem)
        .filter(PaymentScheduleItem.contract_id == contract_id, PaymentScheduleItem.deleted_at.is_(None))
        .order_by(PaymentScheduleItem.due_date.is_(None), PaymentScheduleItem.due_date, PaymentScheduleItem.id)
        .all()
    )
    return {"payments": [_out(p) for p in rows]}


@router.post("")
def create_payment(payload: PaymentIn, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    c = _contract(db, payload.contract_id, for_write=True)
    status = PaymentStatus(payload.status) if payload.status else PaymentStatus.SCHEDULED
    p = PaymentScheduleItem(
        contract_id=c.sr_no, description=(payload.description or None), due_date=payload.due_date,
        amount=payload.amount, currency=(payload.currency or c.currency or "INR"),
        po_reference=payload.po_reference or c.po_number, invoice_reference=payload.invoice_reference,
        status=status,
    )
    db.add(p)
    db.flush()
    log_action(db, "contract", c.sr_no, "ADD_PAYMENT", user_id=user.id, new_value=str(payload.amount))
    db.commit()
    return _out(p)


@router.patch("/{payment_id}")
def update_payment(payment_id: int, payload: PaymentUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_validator)):
    p = db.get(PaymentScheduleItem, payment_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Payment not found")
    _contract(db, p.contract_id, for_write=True)
    for f in ("description", "due_date", "amount", "currency", "po_reference", "invoice_reference", "paid_date"):
        v = getattr(payload, f)
        if v is not None:
            setattr(p, f, v or None if f in ("description", "po_reference", "invoice_reference") else v)
    if payload.status is not None:
        p.status = PaymentStatus(payload.status)
        if p.status == PaymentStatus.PAID and p.paid_date is None:
            p.paid_date = date.today()
    log_action(db, "contract", p.contract_id, "UPDATE_PAYMENT", user_id=user.id)
    db.commit()
    return _out(p)


@router.delete("/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    p = db.get(PaymentScheduleItem, payment_id)
    if p is None or p.deleted_at is not None:
        raise HTTPException(404, "Payment not found")
    _contract(db, p.contract_id, for_write=True)
    p.deleted_at = datetime.now(timezone.utc)
    log_action(db, "contract", p.contract_id, "DELETE_PAYMENT", user_id=user.id)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def spend_summary(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Portfolio spend: spend-under-management (total value of active contracts),
    scheduled/invoiced/paid/outstanding from the payment schedule, and negotiated
    savings. Amounts are grouped by currency (no FX conversion offline)."""
    active = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED, Contract.deleted_at.is_(None))
        .all()
    )
    sum_val: dict[str, float] = {}
    savings: dict[str, float] = {}
    for c in active:
        cur = c.currency or "INR"
        if c.contract_value is not None:
            sum_val[cur] = sum_val.get(cur, 0.0) + float(c.contract_value)
        if c.savings_amount is not None:
            savings[cur] = savings.get(cur, 0.0) + float(c.savings_amount)

    items = (
        db.query(PaymentScheduleItem)
        .options(joinedload(PaymentScheduleItem.contract))
        .filter(PaymentScheduleItem.deleted_at.is_(None))
        .all()
    )
    paid: dict[str, float] = {}
    scheduled: dict[str, float] = {}
    invoiced: dict[str, float] = {}
    for p in items:
        if p.contract is None or p.contract.deleted_at is not None:
            continue
        cur = p.currency or "INR"
        amt = float(p.amount) if p.amount is not None else 0.0
        if p.status == PaymentStatus.PAID:
            paid[cur] = paid.get(cur, 0.0) + amt
        elif p.status == PaymentStatus.INVOICED:
            invoiced[cur] = invoiced.get(cur, 0.0) + amt
        else:
            scheduled[cur] = scheduled.get(cur, 0.0) + amt

    currencies = sorted(set(sum_val) | set(paid) | set(scheduled) | set(invoiced) | set(savings))
    by_currency = [{
        "currency": cur,
        "spend_under_management": round(sum_val.get(cur, 0.0), 2),
        "paid": round(paid.get(cur, 0.0), 2),
        "invoiced": round(invoiced.get(cur, 0.0), 2),
        "scheduled": round(scheduled.get(cur, 0.0), 2),
        "outstanding": round(invoiced.get(cur, 0.0) + scheduled.get(cur, 0.0), 2),
        "savings": round(savings.get(cur, 0.0), 2),
    } for cur in currencies]
    # Base-currency roll-up of spend-under-management (G15).
    from ..services.fx import base_currency, rate_map, to_base
    rates = rate_map(db)
    base = base_currency(db)
    sum_under_mgmt_base = 0.0
    for cur, v in sum_val.items():
        conv = to_base(v, cur, rates)
        if conv is not None:
            sum_under_mgmt_base += conv
    return {"active_contracts": len(active), "by_currency": by_currency,
            "base_currency": base, "spend_under_management_base": round(sum_under_mgmt_base, 2)}
