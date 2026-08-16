"""Documented, read-only REST API (G17) authenticated by an API token, plus the
event catalog for the outbound webhooks. Intended for internal integrations
(BI tools, iPaaS on the internal network). Token is passed as `X-API-Key`."""
import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ApiToken, Contract, ContractMilestone, ContractStatus, MilestoneStatus
from ..serializers import contract_out
from ..services.event_webhooks import EVENT_TYPES

router = APIRouter(prefix="/v1", tags=["public-api"])


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def require_api_token(x_api_key: str | None = Header(default=None),
                      db: Session = Depends(get_db)) -> ApiToken:
    if not x_api_key:
        raise HTTPException(401, "Missing X-API-Key header")
    tok = (
        db.query(ApiToken)
        .filter(ApiToken.token_hash == hash_token(x_api_key.strip()),
                ApiToken.deleted_at.is_(None), ApiToken.active.is_(True))
        .first()
    )
    if tok is None:
        raise HTTPException(401, "Invalid API token")
    if tok.expires_at and tok.expires_at.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(401, "API token has expired")
    tok.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return tok


@router.get("/ping")
def ping(_: ApiToken = Depends(require_api_token)):
    return {"ok": True, "service": "contract-ms", "api": "v1"}


@router.get("/contracts")
def api_list_contracts(
    status: str | None = None, contract_type: str | None = None, vendor_id: int | None = None,
    limit: int = Query(50, le=200), offset: int = 0,
    db: Session = Depends(get_db), _: ApiToken = Depends(require_api_token),
):
    q = db.query(Contract).filter(Contract.deleted_at.is_(None))
    if status:
        try:
            q = q.filter(Contract.status == ContractStatus(status))
        except ValueError:
            raise HTTPException(400, "Invalid status")
    else:
        q = q.filter(Contract.status == ContractStatus.VALIDATED)
    if contract_type:
        q = q.filter(Contract.contract_type == contract_type)
    if vendor_id:
        q = q.filter(Contract.vendor_id == vendor_id)
    total = q.count()
    rows = q.order_by(Contract.sr_no.desc()).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset,
            "items": [contract_out(c) for c in rows]}


@router.get("/contracts/{sr_no}")
def api_get_contract(sr_no: int, db: Session = Depends(get_db), _: ApiToken = Depends(require_api_token)):
    c = db.get(Contract, sr_no)
    if c is None or c.deleted_at is not None:
        raise HTTPException(404, "Contract not found")
    return contract_out(c, detail=True)


@router.get("/obligations")
def api_list_obligations(
    status: str | None = None, contract_id: int | None = None, limit: int = Query(100, le=500),
    db: Session = Depends(get_db), _: ApiToken = Depends(require_api_token),
):
    q = (
        db.query(ContractMilestone)
        .join(Contract, Contract.sr_no == ContractMilestone.contract_id)
        .filter(ContractMilestone.deleted_at.is_(None), Contract.deleted_at.is_(None))
    )
    if contract_id:
        q = q.filter(ContractMilestone.contract_id == contract_id)
    if status:
        try:
            q = q.filter(ContractMilestone.status == MilestoneStatus(status))
        except ValueError:
            raise HTTPException(400, "Invalid status")
    rows = q.order_by(ContractMilestone.due_date.is_(None), ContractMilestone.due_date).limit(limit).all()
    return {"items": [{
        "id": m.id, "contract_id": m.contract_id, "title": m.title,
        "obligation_type": m.obligation_type, "owner_party": m.owner_party,
        "due_date": m.due_date.isoformat() if m.due_date else None, "status": m.status.value,
    } for m in rows]}


@router.get("/events/catalog")
def api_event_catalog(_: ApiToken = Depends(require_api_token)):
    return {"events": _event_catalog()}


def _event_catalog() -> list[dict]:
    descriptions = {
        "contract.validated": "A contract passed validation and entered the active register.",
        "contract.rejected": "A contract was rejected during validation.",
        "contract.renewed": "A contract was renewed (a renewal thread advanced).",
        "contract.terminated": "A contract was terminated before its natural expiry.",
    }
    sample_data = {"sr_no": 123, "status": "VALIDATED", "vendor": "Acme Corp",
                   "contract_type": "MSA", "contract_value": 250000, "currency": "INR",
                   "start_date": "2026-01-01", "end_date": "2026-12-31"}
    return [{
        "event": e, "description": descriptions.get(e, ""),
        "sample_payload": {"event": e, "timestamp": "2026-01-01T00:00:00Z", "data": sample_data},
    } for e in sorted(EVENT_TYPES)]
