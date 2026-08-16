"""R3 2.2: validating a contract auto-feeds its clauses into the library."""
import uuid
from datetime import date, timedelta

CLAUSE_TEXT = (
    "1. Indemnity. The Vendor shall indemnify and hold harmless the Company against all claims.\n\n"
    "2. Payment Terms. The Company shall pay each invoice within Net 45 days of receipt.\n\n"
    "3. Confidentiality. Each party shall keep Confidential Information secret at all times."
)


def _seed_pending(text=CLAUSE_TEXT):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus, Department
    db = SessionLocal()
    dept = Department(name=f"AutoLearnDept-{uuid.uuid4().hex[:6]}")
    db.add(dept); db.flush()
    c = Contract(signing_entity="Inventurus", vendor_name_raw="AL Vendor",
                 start_date=date.today(), end_date=date.today() + timedelta(days=365),
                 department_id=dept.id, contract_service="svc", po_number="PO-AL-1",
                 status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={},
                 extracted_text=text)
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_validation_feeds_clause_library(client, admin_headers):
    before = client.get("/api/clauses/stats", headers=admin_headers).json()
    before_versions = sum(s["versions"] for s in before)

    sr = _seed_pending()
    r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    assert r.status_code == 200 and r.json()["status"] == "VALIDATED", r.text

    after = client.get("/api/clauses/stats", headers=admin_headers).json()
    after_versions = sum(s["versions"] for s in after)
    assert after_versions > before_versions
    # the Indemnity clause is now searchable in the library
    rows = client.get("/api/clauses?clause_type=Indemnity", headers=admin_headers).json()
    assert any("indemnify" in (v["text"] or "").lower() for v in rows)


def test_autolearn_can_be_disabled(client, admin_headers):
    client.put("/api/settings", headers=admin_headers, json={"values": {"clause_autolearn": "false"}})
    before = sum(s["versions"] for s in client.get("/api/clauses/stats", headers=admin_headers).json())
    sr = _seed_pending("1. Force Majeure. Neither party is liable for events beyond its reasonable control whatsoever.")
    client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    after = sum(s["versions"] for s in client.get("/api/clauses/stats", headers=admin_headers).json())
    assert after == before
    client.put("/api/settings", headers=admin_headers, json={"values": {"clause_autolearn": "true"}})
