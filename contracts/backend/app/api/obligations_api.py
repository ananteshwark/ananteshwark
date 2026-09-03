"""Obligation portfolio (G4/D1): a cross-contract view of every obligation in
the milestone register, with owner/status/type filters and a summary. Individual
obligations are created/edited via the contract milestones endpoints; this router
is the read-across-the-repository layer plus portfolio stats."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import Contract, ContractMilestone, ContractStatus, MilestoneStatus, User

router = APIRouter(prefix="/obligations", tags=["obligations"])


def _out(m: ContractMilestone) -> dict:
    c = m.contract
    return {
        "id": m.id, "contract_id": m.contract_id,
        "vendor_name": c.counterparty_name if c else None,
        "contract_type": c.contract_type if c else None,
        "title": m.title, "obligation_type": m.obligation_type,
        "owner_party": m.owner_party, "owner_user_id": m.owner_user_id,
        "owner_user_name": m.owner_user.name if m.owner_user_id and m.owner_user else None,
        "frequency": m.frequency,
        "due_date": m.due_date.isoformat() if m.due_date else None,
        "status": m.status.value,
        "overdue": bool(m.status == MilestoneStatus.PENDING and m.due_date and m.due_date < date.today()),
        "ai_generated": bool(m.ai_generated),
    }


def _base_query(db: Session):
    return (
        db.query(ContractMilestone)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .options(joinedload(ContractMilestone.contract), joinedload(ContractMilestone.owner_user))
        .filter(ContractMilestone.deleted_at.is_(None))
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.status == ContractStatus.VALIDATED)
    )


@router.get("")
def list_obligations(
    owner: str | None = None,          # "me" to limit to obligations assigned to the caller
    status: str | None = None,         # PENDING | DONE
    obligation_type: str | None = None,
    owner_party: str | None = None,    # us | counterparty | both
    overdue: bool = False,
    contract_id: int | None = None,
    limit: int = 500,
    db: Session = Depends(get_db), user: User = Depends(require_viewer),
):
    q = _base_query(db)
    if owner == "me":
        q = q.filter(ContractMilestone.owner_user_id == user.id)
    if status:
        try:
            q = q.filter(ContractMilestone.status == MilestoneStatus(status))
        except ValueError:
            pass
    if obligation_type:
        q = q.filter(ContractMilestone.obligation_type == obligation_type)
    if owner_party:
        q = q.filter(ContractMilestone.owner_party == owner_party)
    if contract_id:
        q = q.filter(ContractMilestone.contract_id == contract_id)
    if overdue:
        q = q.filter(ContractMilestone.status == MilestoneStatus.PENDING,
                     ContractMilestone.due_date.isnot(None),
                     ContractMilestone.due_date < date.today())
    rows = (
        q.order_by(ContractMilestone.due_date.is_(None), ContractMilestone.due_date,
                   ContractMilestone.id)
        .limit(min(limit, 2000)).all()
    )
    return {"obligations": [_out(m) for m in rows]}


class BulkAction(BaseModel):
    ids: list[int]
    action: str                    # complete | reopen | assign | due_date
    owner_user_id: int | None = None
    due_date: date | None = None


@router.post("/bulk")
def bulk_update(payload: BulkAction, db: Session = Depends(get_db),
                user: User = Depends(require_validator)):
    """Apply one action to many obligations at once (F7) — the portfolio view
    lists hundreds, and ticking them one at a time is the main complaint."""
    if not payload.ids:
        return {"updated": 0}
    rows = (
        db.query(ContractMilestone)
        .filter(ContractMilestone.id.in_(payload.ids[:2000]),
                ContractMilestone.deleted_at.is_(None))
        .all()
    )
    action = (payload.action or "").strip().lower()
    if action not in ("complete", "reopen", "assign", "due_date"):
        raise HTTPException(400, "action must be complete, reopen, assign or due_date")
    if action == "assign" and payload.owner_user_id is None:
        raise HTTPException(400, "owner_user_id is required to assign")
    if action == "due_date" and payload.due_date is None:
        raise HTTPException(400, "due_date is required")

    for m in rows:
        if action == "complete":
            m.status = MilestoneStatus.DONE
            m.completed_at = datetime.now(timezone.utc)
            m.completed_by_id = user.id
        elif action == "reopen":
            m.status = MilestoneStatus.PENDING
            m.completed_at = None
            m.completed_by_id = None
        elif action == "assign":
            m.owner_user_id = payload.owner_user_id or None
        else:
            m.due_date = payload.due_date
    log_action(db, "contract", 0, "BULK_OBLIGATION", user_id=user.id,
               new_value=f"{action} × {len(rows)}")
    db.commit()
    return {"updated": len(rows), "action": action}


@router.get("/stats")
def obligation_stats(db: Session = Depends(get_db), user: User = Depends(require_viewer)):
    """Portfolio summary: open/done/overdue counts, a per-type breakdown, and how
    many are assigned to the caller."""
    rows = _base_query(db).all()
    today = date.today()
    total = len(rows)
    done = sum(1 for m in rows if m.status == MilestoneStatus.DONE)
    open_ = total - done
    overdue = sum(1 for m in rows
                  if m.status == MilestoneStatus.PENDING and m.due_date and m.due_date < today)
    mine_open = sum(1 for m in rows
                    if m.owner_user_id == user.id and m.status == MilestoneStatus.PENDING)
    by_type: dict[str, int] = {}
    for m in rows:
        if m.status == MilestoneStatus.PENDING:
            by_type[m.obligation_type or "other"] = by_type.get(m.obligation_type or "other", 0) + 1
    return {"total": total, "open": open_, "done": done, "overdue": overdue,
            "mine_open": mine_open,
            "by_type": [{"type": k, "count": v} for k, v in sorted(by_type.items(), key=lambda x: -x[1])]}
