"""R4 3.11: negotiation ledger is retained; finalized drafts can't be deleted."""


def _draft(client, h):
    return client.post("/api/authoring/drafts", headers=h,
                       json={"origin": "scratch", "contract_type": "MSA"}).json()


def test_finalized_draft_cannot_be_deleted(client, admin_headers):
    d = _draft(client, admin_headers)
    dept = client.post("/api/departments", headers=admin_headers, json={"name": "RetDept"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={
        "department_id": dept["id"],
        "fields": {"signing_entity": "Inventurus", "vendor": "RetVendor",
                   "start_date": "2026-01-01", "end_date": "2026-12-31",
                   "contract_service": "svc", "po_number": "PO-RET-1"},
    })
    client.post(f"/api/authoring/drafts/{d['id']}/finalize", headers=admin_headers)
    r = client.delete(f"/api/authoring/drafts/{d['id']}", headers=admin_headers)
    assert r.status_code == 409


def test_deleted_draft_can_be_listed_and_restored(client, admin_headers):
    d = _draft(client, admin_headers)
    assert client.delete(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).status_code == 200
    # it disappears from the normal list and detail
    assert client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).status_code == 404
    deleted = client.get("/api/authoring/drafts/deleted", headers=admin_headers).json()
    assert any(x["id"] == d["id"] for x in deleted)
    # restore brings it back
    r = client.post(f"/api/authoring/drafts/{d['id']}/restore-deleted", headers=admin_headers)
    assert r.status_code == 200
    assert client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).status_code == 200


def test_ledger_survives_draft_soft_delete(client, admin_headers):
    d = _draft(client, admin_headers)
    link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                       json={"recipients": [{"email": "v@x.com"}]}).json()["links"][0]
    client.post(f"/api/vendor/{link['token']}/changes", json={
        "change_type": "REPLACE", "original_text": "a", "proposed_text": "b"})
    # soft-delete the (non-finalized) draft
    assert client.delete(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).status_code == 200
    # the tracked-change ledger rows still exist in the database
    from app.database import SessionLocal
    from app.models import TrackedChange
    db = SessionLocal()
    try:
        rows = db.query(TrackedChange).filter(TrackedChange.draft_id == d["id"]).all()
        assert len(rows) >= 1
    finally:
        db.close()
