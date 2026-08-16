"""Contract lifecycle transitions.

A validated, ACTIVE contract whose end date has passed is EXPIRED. Rather than
waiting for the nightly reminder job (which only reaches contracts that have
reminder offsets configured), this sweep flips every due contract as soon as it
is observed — it is cheap (a single indexed UPDATE that touches only rows that
actually changed) and is invoked opportunistically on contract reads as well as
from the daily job, so the register reflects expiry immediately.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..models import Contract, ContractStatus, LifecycleStatus


def sweep_expired(db: Session, today: date | None = None) -> int:
    """Flip validated, ACTIVE, past-end-date contracts to EXPIRED. Returns count.

    Does not commit — the caller owns the transaction boundary.
    """
    today = today or date.today()
    result = db.execute(
        update(Contract)
        .where(
            Contract.status == ContractStatus.VALIDATED,
            Contract.lifecycle_status == LifecycleStatus.ACTIVE,
            Contract.deleted_at.is_(None),
            Contract.end_date.isnot(None),
            Contract.end_date < today,
        )
        .values(lifecycle_status=LifecycleStatus.EXPIRED)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0
