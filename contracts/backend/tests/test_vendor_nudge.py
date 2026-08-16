"""R4 3.14: vendors are nudged once as their review due date approaches."""
import uuid


def _draft_with_share(client, admin_headers, due_days, email):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                json={"recipients": [{"email": email}], "due_days": due_days})
    return d


def _link(db, email):
    from app.models import VendorShareLink
    return db.query(VendorShareLink).filter(VendorShareLink.recipient_email == email).first()


def test_nudge_sent_once_when_due_soon(client, admin_headers):
    from app.database import SessionLocal
    from app.services.collaboration import nudge_due_links

    email = f"nudge-{uuid.uuid4().hex[:6]}@x.com"
    _draft_with_share(client, admin_headers, due_days=1, email=email)   # due tomorrow -> within 48h
    db = SessionLocal()
    try:
        nudge_due_links(db)
        link = _link(db, email)
        assert link.nudged_at is not None
        first = link.nudged_at
        # a second run does not re-nudge this link
        nudge_due_links(db)
        db.refresh(link)
        assert link.nudged_at == first
    finally:
        db.close()


def test_not_nudged_when_far_off(client, admin_headers):
    from app.database import SessionLocal
    from app.services.collaboration import nudge_due_links
    email = f"far-{uuid.uuid4().hex[:6]}@x.com"
    _draft_with_share(client, admin_headers, due_days=30, email=email)   # far away
    db = SessionLocal()
    try:
        nudge_due_links(db)
        assert _link(db, email).nudged_at is None
    finally:
        db.close()
