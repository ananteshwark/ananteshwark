"""Immutable audit trail helpers."""
from sqlalchemy.orm import Session

from .models import AuditLog


def log_action(
    db: Session,
    entity_type: str,
    entity_id: int,
    action: str,
    user_id: int | None = None,
    field: str | None = None,
    old_value=None,
    new_value=None,
) -> None:
    db.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            field=field,
            old_value=None if old_value is None else str(old_value),
            new_value=None if new_value is None else str(new_value),
            user_id=user_id,
        )
    )


def log_field_changes(
    db: Session,
    entity_type: str,
    entity_id: int,
    old: dict,
    new: dict,
    user_id: int | None,
    action: str = "UPDATE",
) -> None:
    """Write one audit row per changed field (old value -> new value -> who -> when)."""
    for field, new_value in new.items():
        old_value = old.get(field)
        if str(old_value) != str(new_value):
            log_action(
                db,
                entity_type,
                entity_id,
                action,
                user_id=user_id,
                field=field,
                old_value=old_value,
                new_value=new_value,
            )
