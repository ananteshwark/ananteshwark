"""AI governance endpoints (Phase I): the audit trail, human verdicts, the
prompt/model registry, and the eval harness."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_author, require_viewer
from ..database import get_db
from ..models import AiRun, User

router = APIRouter(prefix="/ai", tags=["ai-governance"])


class Outcome(BaseModel):
    outcome: str            # accepted | rejected | edited
    note: str | None = None


def _run_out(r: AiRun) -> dict:
    return {
        "id": r.id, "feature": r.feature, "entity_type": r.entity_type,
        "entity_id": r.entity_id, "provider": r.provider, "model": r.model,
        "prompt_version": r.prompt_version, "ai_used": r.ai_used,
        "latency_ms": r.latency_ms, "confidence": r.confidence, "verified": r.verified,
        "outcome": r.outcome, "outcome_note": r.outcome_note,
        "outcome_at": r.outcome_at.isoformat() if r.outcome_at else None,
        "output": (r.output or "")[:600],
        # Why the model was skipped, when it was. A "rule" badge with no
        # reason cannot distinguish deliberate offline operation from a
        # provider that has been failing since the key expired.
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/runs")
def list_runs(feature: str | None = None, outcome: str | None = None,
              unjudged: bool = False, limit: int = Query(100, le=500),
              db: Session = Depends(get_db), _: User = Depends(require_author)):
    """The AI audit trail — what was produced, by which model and prompt, and
    what the human did with it."""
    q = db.query(AiRun)
    if feature:
        q = q.filter(AiRun.feature == feature)
    if outcome:
        q = q.filter(AiRun.outcome == outcome)
    if unjudged:
        q = q.filter(AiRun.outcome.is_(None))
    rows = q.order_by(AiRun.created_at.desc()).limit(limit).all()
    return {"runs": [_run_out(r) for r in rows]}


@router.post("/runs/{run_id}/outcome")
def set_run_outcome(run_id: int, payload: Outcome, db: Session = Depends(get_db),
                    user: User = Depends(require_author)):
    """Record whether a human accepted, edited or rejected an AI output."""
    from ..services.ai_audit import set_outcome
    try:
        entry = set_outcome(db, run_id, payload.outcome, user.id, payload.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if entry is None:
        raise HTTPException(404, "AI run not found")
    db.commit()
    return _run_out(entry)


@router.get("/stats")
def stats(feature: str | None = None, db: Session = Depends(get_db),
          _: User = Depends(require_viewer)):
    """How often humans keep what the AI produced, per feature."""
    from ..services.ai_audit import acceptance_stats
    return acceptance_stats(db, feature)


@router.get("/registry")
def prompt_registry(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Prompt versions and model routing per feature (I3)."""
    from ..services.prompt_registry import registry
    return {"features": registry(db)}


@router.post("/evals/run")
def run_evals(suites: str | None = None, db: Session = Depends(get_db),
              user: User = Depends(require_author)):
    """Run the golden-set evals (I2). Deterministic and model-free, so this is
    safe to gate a release on."""
    from ..services.evals import run_all
    names = [s.strip() for s in (suites or "").split(",") if s.strip()] or None
    result = run_all(db, names)
    log_action(db, "settings", 0, "AI_EVAL", user_id=user.id,
               new_value=f"{result['passed']}/{result['total']} ({result['score']})")
    db.commit()
    return result
