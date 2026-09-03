from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import Contract, ContractStatus, IngestionFile, IngestionStatus, User, utcnow
from ..serializers import contract_completeness, ingestion_out
from ..services.extraction_worker import extraction_queue, request_secondary_retry
from ..services.settings_store import get_setting

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


def _min_confidence(confidence) -> float | None:
    vals = [v for v in (confidence or {}).values() if isinstance(v, (int, float))]
    return min(vals) if vals else None


def _stats_by_contract(db: Session, rows: list[IngestionFile]) -> dict[int, tuple]:
    """Map contract_id -> (min_confidence, completeness) for the given rows."""
    ids = [f.contract_id for f in rows if f.contract_id]
    if not ids:
        return {}
    return {
        c.sr_no: (_min_confidence(c.confidence), contract_completeness(c))
        for c in db.query(Contract).filter(Contract.sr_no.in_(ids)).all()
    }


@router.get("")
def list_ingestion(
    status: str | None = None,
    q: str | None = None,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_viewer),
):
    query = db.query(IngestionFile).order_by(IngestionFile.detected_at.desc())
    if status:
        try:
            query = query.filter(IngestionFile.status == IngestionStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    if q:
        query = query.filter(IngestionFile.filename.ilike(f"%{q}%"))
    total = query.count()
    rows = query.limit(min(limit, 500)).offset(offset).all()
    stats = _stats_by_contract(db, rows)
    return {"total": total,
            "secondary_enabled": get_setting(db, "secondary_extraction_enabled") == "true",
            "items": [
                ingestion_out(f, min_confidence=stats.get(f.contract_id, (None, None))[0],
                              completeness=stats.get(f.contract_id, (None, None))[1])
                for f in rows
            ]}


@router.get("/token-usage")
def token_usage(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Aggregate AI token consumption across all processed files."""
    from sqlalchemy import func
    inp, out = (
        db.query(
            func.coalesce(func.sum(IngestionFile.input_tokens), 0),
            func.coalesce(func.sum(IngestionFile.output_tokens), 0),
        ).one()
    )
    files = db.query(IngestionFile).filter(IngestionFile.input_tokens.isnot(None)).count()
    return {
        "input_tokens": int(inp),
        "output_tokens": int(out),
        "total_tokens": int(inp) + int(out),
        "files_processed": int(files),
    }


@router.get("/{ingestion_id}")
def get_ingestion(ingestion_id: int, db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    record = db.get(IngestionFile, ingestion_id)
    if record is None:
        raise HTTPException(404, "Ingestion record not found")
    contract = db.get(Contract, record.contract_id) if record.contract_id else None
    return ingestion_out(
        record,
        min_confidence=_min_confidence(contract.confidence) if contract else None,
        completeness=contract_completeness(contract) if contract else None,
    )


@router.post("/{ingestion_id}/retry")
def retry_ingestion(
    ingestion_id: int, secondary: bool = False,
    db: Session = Depends(get_db), _: User = Depends(require_validator),
):
    """Re-run extraction. Allowed for failed files, and for a low-confidence (or
    any still-unvalidated) extraction so a better model can re-process it — the
    stale pending contract is superseded by the fresh extraction. With
    `secondary=true` the second AI extractor is used (Retry with 2nd AI)."""
    record = db.get(IngestionFile, ingestion_id)
    if record is None:
        raise HTTPException(404, "Ingestion record not found")

    if secondary and get_setting(db, "secondary_extraction_enabled") != "true":
        raise HTTPException(400, "The second AI extractor is not enabled in Admin Settings")

    if record.status != IngestionStatus.FAILED:
        contract = db.get(Contract, record.contract_id) if record.contract_id else None
        if contract is not None and contract.deleted_at is None:
            if contract.status != ContractStatus.PENDING_VALIDATION:
                raise HTTPException(400, "This contract has already been validated; cannot re-extract")
            contract.deleted_at = utcnow()  # supersede the pending draft with a fresh extraction

    record.status = IngestionStatus.QUEUED
    record.error = None
    record.contract_id = None
    record.processed_at = None
    db.commit()
    if secondary:
        request_secondary_retry(record.id)
    extraction_queue.put(record.id)
    return ingestion_out(record)
