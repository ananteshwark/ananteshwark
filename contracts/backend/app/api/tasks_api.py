"""Lightweight tasks: assign a to-do to a user, optionally anchored to a contract
or draft. Any signed-in user can create/see their own; assignment notifies the
owner."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import get_current_user
from ..database import get_db
from ..models import Task, User, utcnow
from ..services.user_notifications import create_notification

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskIn(BaseModel):
    title: str
    description: str | None = None
    owner_id: int | None = None
    due_date: str | None = None
    priority: str | None = "normal"
    entity_type: str | None = None
    entity_id: int | None = None


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    owner_id: int | None = None
    due_date: str | None = None
    priority: str | None = None
    status: str | None = None


def _out(t: Task) -> dict:
    return {
        "id": t.id, "title": t.title, "description": t.description,
        "owner_id": t.owner_id, "owner_name": t.owner.name if t.owner else None,
        "created_by_id": t.created_by_id,
        "created_by_name": t.created_by.name if t.created_by else None,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "priority": t.priority, "status": t.status,
        "entity_type": t.entity_type, "entity_id": t.entity_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


def _parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


@router.post("")
def create_task(payload: TaskIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not payload.title.strip():
        raise HTTPException(400, "A task title is required")
    t = Task(
        title=payload.title.strip(), description=(payload.description or "").strip() or None,
        owner_id=payload.owner_id or user.id, created_by_id=user.id,
        due_date=_parse_date(payload.due_date),
        priority=payload.priority if payload.priority in ("low", "normal", "high") else "normal",
        entity_type=payload.entity_type, entity_id=payload.entity_id,
    )
    db.add(t)
    db.flush()
    if t.owner_id and t.owner_id != user.id:
        link = (f"/contracts/{t.entity_id}" if t.entity_type == "contract"
                else f"/authoring/drafts/{t.entity_id}" if t.entity_type == "contract_draft" else "/tasks")
        create_notification(db, t.owner_id, "task_assigned",
                            f"{user.name} assigned you a task: “{t.title}”", link=link)
    log_action(db, "task", t.id, "CREATE", user_id=user.id, new_value=t.title)
    db.commit()
    return _out(t)


@router.get("")
def list_tasks(mine: bool = True, status: str | None = None,
               entity_type: str | None = None, entity_id: int | None = None,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Task)
    if entity_type and entity_id:
        q = q.filter(Task.entity_type == entity_type, Task.entity_id == entity_id)
    elif mine:
        q = q.filter(Task.owner_id == user.id)
    if status in ("open", "done"):
        q = q.filter(Task.status == status)
    rows = q.order_by(Task.status, Task.due_date.is_(None), Task.due_date, Task.created_at.desc()).all()
    return {"tasks": [_out(t) for t in rows]}


@router.patch("/{task_id}")
def update_task(task_id: int, payload: TaskPatch, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    t = db.get(Task, task_id)
    if t is None:
        raise HTTPException(404, "Task not found")
    if payload.title is not None:
        t.title = payload.title.strip() or t.title
    if payload.description is not None:
        t.description = payload.description.strip() or None
    if payload.owner_id is not None:
        t.owner_id = payload.owner_id or None
    if payload.due_date is not None:
        t.due_date = _parse_date(payload.due_date)
    if payload.priority is not None and payload.priority in ("low", "normal", "high"):
        t.priority = payload.priority
    if payload.status is not None and payload.status in ("open", "done"):
        t.status = payload.status
        t.completed_at = utcnow() if payload.status == "done" else None
    log_action(db, "task", t.id, "UPDATE", user_id=user.id, new_value=t.status)
    db.commit()
    return _out(t)


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.get(Task, task_id)
    if t is None:
        raise HTTPException(404, "Task not found")
    db.delete(t)
    log_action(db, "task", task_id, "DELETE", user_id=user.id)
    db.commit()
    return {"ok": True}
