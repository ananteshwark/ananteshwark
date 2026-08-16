"""Tag master: create/list/delete the labels used to categorize contracts."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_validator, require_viewer
from ..database import get_db
from ..models import Tag, User, contract_tags, utcnow
from ..schemas import TagIn

router = APIRouter(prefix="/tags", tags=["tags"])


def _tag_out(t: Tag, count: int = 0) -> dict:
    return {"id": t.id, "name": t.name, "color": t.color, "contract_count": count}


@router.get("")
def list_tags(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    counts = dict(
        db.query(contract_tags.c.tag_id, func.count()).group_by(contract_tags.c.tag_id).all()
    )
    rows = db.query(Tag).filter(Tag.deleted_at.is_(None)).order_by(Tag.name).all()
    return [_tag_out(t, counts.get(t.id, 0)) for t in rows]


@router.post("")
def create_tag(payload: TagIn, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Tag name is required")
    existing = db.query(Tag).filter(func.lower(Tag.name) == name.lower()).first()
    if existing is not None:
        if existing.deleted_at is not None:  # revive a previously deleted tag
            existing.deleted_at = None
            existing.color = payload.color
            db.commit()
            return _tag_out(existing)
        raise HTTPException(409, f"Tag '{name}' already exists")
    tag = Tag(name=name, color=payload.color)
    db.add(tag)
    db.flush()
    log_action(db, "tag", tag.id, "CREATE", user_id=user.id, new_value=name)
    db.commit()
    return _tag_out(tag)


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db), user: User = Depends(require_validator)):
    tag = db.get(Tag, tag_id)
    if tag is None or tag.deleted_at is not None:
        raise HTTPException(404, "Tag not found")
    tag.deleted_at = utcnow()
    # Detach the tag from every contract it was applied to
    db.execute(contract_tags.delete().where(contract_tags.c.tag_id == tag_id))
    log_action(db, "tag", tag.id, "DELETE", user_id=user.id, old_value=tag.name)
    db.commit()
    return {"ok": True}
