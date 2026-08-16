"""Public, no-login contract-action endpoints reached from an expiry-reminder
email. A token exposes exactly one contract and only the renew/terminate
decision — nothing else. No OTP; the token itself is the key (single use)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..database import get_db
from ..models import Contract, ContractActionToken, LifecycleStatus
from ..services import contract_actions as CA

router = APIRouter(prefix="/contract-action", tags=["contract-action"])


def _tok(db: Session, token: str) -> ContractActionToken:
    row = db.query(ContractActionToken).filter(ContractActionToken.token == token).first()
    ok, reason = CA.token_is_valid(row)
    if not ok:
        raise HTTPException(403, reason)
    return row


class RenewIn(BaseModel):
    signing_entity: str | None = None
    contract_type: str | None = None
    contract_service: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    phi_shared: bool = False


@router.get("/{token}")
def open_action(token: str, db: Session = Depends(get_db)):
    tok = _tok(db, token)
    contract = db.get(Contract, tok.contract_id)
    if contract is None or contract.deleted_at is not None:
        raise HTTPException(404, "Contract not found.")
    tok.open_count = (tok.open_count or 0) + 1
    if tok.opened_at is None:
        from ..models import utcnow
        tok.opened_at = utcnow()
    db.commit()

    # Dropdown options for the renewal form.
    from ..models import InternalEntity
    entities = sorted({e.name for e in db.query(InternalEntity).all()} |
                      ({contract.signing_entity} if contract.signing_entity else set()))
    types = sorted({r[0] for r in db.query(Contract.contract_type)
                    .filter(Contract.contract_type.isnot(None)).distinct().all() if r[0]})
    return {
        "contract": {
            "sr_no": contract.sr_no,
            "vendor": contract.vendor.name if contract.vendor else contract.vendor_name_raw,
            "signing_entity": contract.signing_entity,
            "contract_type": contract.contract_type,
            "contract_service": contract.contract_service,
            "department": contract.department.name if contract.department else None,
            "start_date": contract.start_date.isoformat() if contract.start_date else None,
            "end_date": contract.end_date.isoformat() if contract.end_date else None,
            "contract_value": float(contract.contract_value) if contract.contract_value is not None else None,
            "currency": contract.currency,
            "po_number": contract.po_number,
        },
        "renewal_defaults": CA.renewal_defaults(contract),
        "options": {"signing_entities": entities, "contract_types": types},
    }


@router.post("/{token}/terminate")
def terminate(token: str, request: Request, db: Session = Depends(get_db)):
    tok = _tok(db, token)
    contract = db.get(Contract, tok.contract_id)
    if contract is None:
        raise HTTPException(404, "Contract not found.")
    from ..models import utcnow
    contract.lifecycle_status = LifecycleStatus.TERMINATED
    tok.used_at = utcnow()
    tok.decision = "TERMINATE"
    log_action(db, "contract", contract.sr_no, "TERMINATE_VIA_LINK", user_id=None,
               new_value="Terminated by recipient via reminder link")
    db.commit()
    return {"ok": True, "decision": "TERMINATE",
            "message": "Thank you — the contract has been marked as terminated."}


@router.post("/{token}/renew")
def renew(token: str, payload: RenewIn, request: Request, db: Session = Depends(get_db)):
    tok = _tok(db, token)
    contract = db.get(Contract, tok.contract_id)
    if contract is None:
        raise HTTPException(404, "Contract not found.")
    draft = CA.create_renewal_draft(db, contract, payload.model_dump(), created_by_id=None)
    from ..models import utcnow
    tok.used_at = utcnow()
    tok.decision = "RENEW"
    tok.result_draft_id = draft.id
    log_action(db, "contract_draft", draft.id, "RENEWAL_QUEUED_VIA_LINK", user_id=None,
               field=str(contract.sr_no), new_value="Renewal requested by recipient")
    db.commit()
    return {"ok": True, "decision": "RENEW", "draft_id": draft.id,
            "message": "Thank you — a renewal draft has been queued for the contracts team."}
