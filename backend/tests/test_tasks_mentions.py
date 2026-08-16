"""Tasks CRUD + @mention notifications."""


def _user(client, admin_headers, email, name):
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": email, "name": name, "password": "password123", "roles": ["VIEWER"]})
    tok = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}, email


def test_task_lifecycle_and_assignment_notifies(client, admin_headers):
    from app.database import SessionLocal
    from app.models import User, Notification
    h, email = _user(client, admin_headers, "owner@example.com", "Olivia Owner")
    db = SessionLocal(); owner_id = db.query(User).filter_by(email=email).first().id; db.close()

    # Admin creates a task assigned to Olivia.
    r = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Review the MSA", "owner_id": owner_id, "priority": "high", "due_date": "2026-01-01"})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["owner_id"] == owner_id and r.json()["status"] == "open"

    # Olivia sees it in her list and gets a notification.
    mine = client.get("/api/tasks?mine=true", headers=h).json()["tasks"]
    assert any(t["id"] == tid for t in mine)
    db = SessionLocal()
    assert db.query(Notification).filter_by(user_id=owner_id, type="task_assigned").count() >= 1
    db.close()

    # Complete it.
    done = client.patch(f"/api/tasks/{tid}", headers=h, json={"status": "done"})
    assert done.status_code == 200 and done.json()["status"] == "done"
    assert done.json()["completed_at"] is not None


def test_mention_in_review_reply_notifies(client, admin_headers):
    from app.database import SessionLocal
    from app.models import User, Notification
    # A user whose email local-part is a clean token.
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": "mentionme@example.com", "name": "Casey", "password": "password123", "roles": ["LEGAL"]})
    db = SessionLocal(); uid = db.query(User).filter_by(email="mentionme@example.com").first().id; db.close()

    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
    rid = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                      json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "x"}).json()["requests"][0]["id"]
    # Reply mentioning @mentionme.
    client.post(f"/api/authoring/review-requests/{rid}/messages", headers=admin_headers,
                json={"body": "Please weigh in @mentionme"})
    db = SessionLocal()
    assert db.query(Notification).filter_by(user_id=uid, type="mention").count() >= 1
    db.close()
