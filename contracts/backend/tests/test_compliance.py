"""E4/G14 — counterparty compliance vault + vendor risk profile."""
import uuid
from datetime import date, timedelta


def _vendor():
    from app.database import SessionLocal
    from app.models import Vendor
    db = SessionLocal()
    v = Vendor(name=f"Vend {uuid.uuid4().hex[:5]}", normalized_name=uuid.uuid4().hex[:8])
    db.add(v); db.commit(); vid = v.id; db.close()
    return vid


def test_compliance_doc_lifecycle_and_status(client, admin_headers):
    vid = _vendor()
    today = date.today()
    valid = client.post("/api/compliance", headers=admin_headers, json={
        "vendor_id": vid, "doc_type": "insurance", "name": "GL Insurance",
        "expiry_date": (today + timedelta(days=200)).isoformat()}).json()
    assert valid["status"] == "valid" and valid["doc_type"] == "insurance"

    soon = client.post("/api/compliance", headers=admin_headers, json={
        "vendor_id": vid, "doc_type": "w9", "name": "W-9",
        "expiry_date": (today + timedelta(days=10)).isoformat()}).json()
    assert soon["status"] == "expiring"

    gone = client.post("/api/compliance", headers=admin_headers, json={
        "vendor_id": vid, "doc_type": "dpa", "name": "DPA",
        "expiry_date": (today - timedelta(days=5)).isoformat()}).json()
    assert gone["status"] == "expired"

    docs = client.get(f"/api/compliance?vendor_id={vid}", headers=admin_headers).json()["documents"]
    assert len(docs) == 3

    client.delete(f"/api/compliance/{gone['id']}", headers=admin_headers)
    assert len(client.get(f"/api/compliance?vendor_id={vid}", headers=admin_headers).json()["documents"]) == 2


def test_expiring_watchlist(client, admin_headers):
    vid = _vendor()
    today = date.today()
    client.post("/api/compliance", headers=admin_headers, json={
        "vendor_id": vid, "name": "Expiring cert", "expiry_date": (today + timedelta(days=7)).isoformat()})
    res = client.get("/api/compliance/expiring?days=30", headers=admin_headers).json()
    assert res["expiring"] >= 1
    assert any(d["vendor_id"] == vid for d in res["documents"])


def test_vendor_risk_profile(client, admin_headers):
    vid = _vendor()
    r = client.put(f"/api/compliance/vendors/{vid}/risk", headers=admin_headers,
                   json={"risk_rating": "high", "risk_notes": "Sanctions exposure"}).json()
    assert r["risk_rating"] == "high"
    # bad rating rejected
    assert client.put(f"/api/compliance/vendors/{vid}/risk", headers=admin_headers,
                      json={"risk_rating": "extreme"}).status_code == 400
    # surfaced on the vendor record
    detail = client.get(f"/api/vendors/{vid}/history", headers=admin_headers).json()
    assert detail["vendor"]["risk_rating"] == "high"
