"""Helper for creating in-app user notifications."""
import re

from sqlalchemy.orm import Session

from ..models import Notification, User

_MENTION_RE = re.compile(r"@([A-Za-z0-9][A-Za-z0-9._-]{1,40})")


def create_notification(db: Session, user_id: int, type_: str, message: str, link: str | None = None) -> Notification:
    """Create an in-app notification. Caller commits."""
    n = Notification(user_id=user_id, type=type_, message=message, link=link)
    db.add(n)
    return n


def notify_mentions(db: Session, body: str, actor: User, context: str, link: str | None = None,
                    exclude_ids: set[int] | None = None) -> list[int]:
    """Notify users @-mentioned in `body`. A token like @alice matches a user by
    email local-part or the first word of their name (case-insensitive). Returns
    the list of notified user ids. Caller commits."""
    tokens = {t.lower() for t in _MENTION_RE.findall(body or "")}
    if not tokens:
        return []
    exclude = set(exclude_ids or set()) | {actor.id}
    users = db.query(User).filter(User.is_active.is_(True), User.deleted_at.is_(None)).all()
    notified: list[int] = []
    for u in users:
        if u.id in exclude:
            continue
        local = (u.email or "").split("@")[0].lower()
        first = (u.name or "").split()[0].lower() if u.name else ""
        if local in tokens or (first and first in tokens):
            create_notification(db, u.id, "mention",
                                f"{actor.name} mentioned you in {context}", link=link)
            notified.append(u.id)
            exclude.add(u.id)
    return notified
