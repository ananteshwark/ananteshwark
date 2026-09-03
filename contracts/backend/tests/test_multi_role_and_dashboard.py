"""Multi-role users, dashboard include-pending toggle, and draft signed flag."""
from datetime import date

from app.database import SessionLocal
from app.models import Contract, ContractStatus, Department


def test_create_user_with_multiple_roles(client, admin_headers):
    r = client.post("/api/auth/users", headers=admin_headers, json={
        "email": "multi@example.com", "name": "Multi", "password": "password123",
        "roles": ["VIEWER", "VALIDATOR"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "VIEWER"
    assert set(body["roles"]) == {"VIEWER", "VALIDATOR"}


def test_extra_role_grants_access(client, admin_headers):
    # A primarily-VIEWER user with VALIDATOR as an extra role can hit a
    # validator-only endpoint (the bulk action).
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": "viewerval@example.com", "name": "VV", "password": "password123",
        "roles": ["VIEWER", "VALIDATOR"],
    })
    tok = client.post("/api/auth/login", json={"email": "viewerval@example.com",
                                               "password": "password123"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/contracts/bulk", headers=h, json={"sr_nos": [], "action": "validate"})
    assert r.status_code == 200  # allowed (would be 403 for a plain viewer)


def test_plain_viewer_denied(client, admin_headers):
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": "plainviewer@example.com", "name": "PV", "password": "password123",
        "roles": ["VIEWER"],
    })
    tok = client.post("/api/auth/login", json={"email": "plainviewer@example.com",
                                               "password": "password123"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    r = client.post("/api/contracts/bulk", headers=h, json={"sr_nos": [], "action": "validate"})
    assert r.status_code == 403


def test_dashboard_include_pending(client, admin_headers):
    db = SessionLocal()
    dept = db.query(Department).filter_by(name="DashDept").first() or Department(name="DashDept")
    db.add(dept); db.flush()
    db.add(Contract(vendor_name_raw="PendCo", contract_service="svc", department_id=dept.id,
                    status=ContractStatus.PENDING_VALIDATION, start_date=date(2025, 1, 1),
                    raw_extracted={}, confidence={}))
    db.commit(); db.close()

    base = client.get("/api/dashboard", headers=admin_headers).json()["total_validated"]
    withp = client.get("/api/dashboard?include_pending=true", headers=admin_headers).json()["total_validated"]
    assert withp > base  # pending contract now counted


def test_draft_signed_flag(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
    assert detail["signed"] is False
    # Attach a signed document -> signed flips true.
    import io
    files = {"file": ("signed.pdf", io.BytesIO(b"%PDF-1.4 signed"), "application/pdf")}
    client.post(f"/api/authoring/drafts/{d['id']}/attachments?kind=signed", headers=admin_headers, files=files)
    detail2 = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
    assert detail2["signed"] is True
