from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import (
    Contract,
    ContractStatus,
    DuplicateCandidate,
    DuplicateResolution,
    LifecycleStatus,
    User,
)
from ..schemas import DuplicateResolveRequest
from ..serializers import duplicate_out

router = APIRouter(prefix="/duplicates", tags=["duplicates"])


@router.get("")
def list_duplicates(
    resolution: str = "PENDING",
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    query = db.query(DuplicateCandidate).order_by(DuplicateCandidate.created_at.desc())
    if resolution != "ALL":
        try:
            query = query.filter(DuplicateCandidate.resolution == DuplicateResolution(resolution))
        except ValueError:
            raise HTTPException(400, f"Invalid resolution: {resolution}")
    out = []
    for d in query.all():
        out.append(duplicate_out(d, db.get(Contract, d.contract_id), db.get(Contract, d.matched_contract_id)))
    return out


@router.post("/{candidate_id}/resolve")
def resolve_duplicate(
    candidate_id: int,
    payload: DuplicateResolveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_validator),
):
    candidate = db.get(DuplicateCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(404, "Duplicate candidate not found")
    if candidate.resolution != DuplicateResolution.PENDING:
        raise HTTPException(400, "Candidate already resolved")
    try:
        resolution = DuplicateResolution(payload.resolution)
    except ValueError:
        raise HTTPException(400, f"Invalid resolution: {payload.resolution}")
    if resolution == DuplicateResolution.PENDING:
        raise HTTPException(400, "Choose a final resolution")

    contract = db.get(Contract, candidate.contract_id)
    matched = db.get(Contract, candidate.matched_contract_id)
    if contract is None or matched is None:
        raise HTTPException(404, "Referenced contract missing")

    if resolution == DuplicateResolution.CONFIRMED_DUPLICATE:
        # Link to the original and archive the duplicate record
        contract.status = ContractStatus.ARCHIVED
        contract.thread_id = matched.thread_id or matched.sr_no
        log_action(
            db, "contract", contract.sr_no, "ARCHIVE_DUPLICATE", user_id=user.id,
            new_value=f"Duplicate of contract #{matched.sr_no}",
        )
    elif resolution == DuplicateResolution.RENEWAL:
        # Link as a new version under the same contract thread
        contract.renews_contract_id = matched.sr_no
        contract.thread_id = matched.thread_id or matched.sr_no
        matched.lifecycle_status = LifecycleStatus.RENEWED
        log_action(
            db, "contract", contract.sr_no, "LINK_RENEWAL", user_id=user.id,
            new_value=f"Renewal of contract #{matched.sr_no}",
        )
        log_action(
            db, "contract", matched.sr_no, "RENEWED_BY", user_id=user.id,
            new_value=f"Renewed by contract #{contract.sr_no}",
        )

    candidate.resolution = resolution
    candidate.resolved_by_id = user.id
    candidate.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return duplicate_out(candidate, contract, matched)
