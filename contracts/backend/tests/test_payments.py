"""D2/G12 — payment schedule lines + portfolio spend summary."""
import uuid


def _seed(value=100000, savings=None, currency="INR"):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Pay-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=value, currency=currency,
                 savings_amount=savings, extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_payment_crud_and_status_flow(client, admin_headers):
    sr = _seed()
    p = client.post("/api/payments", headers=admin_headers, json={
        "contract_id": sr, "description": "Milestone 1", "amount": 40000,
        "due_date": "2026-03-01", "po_reference": "PO-42"}).json()
    assert p["status"] == "SCHEDULED" and p["po_reference"] == "PO-42"

    rows = client.get(f"/api/payments?contract_id={sr}", headers=admin_headers).json()["payments"]
    assert len(rows) == 1

    # mark paid — paid_date auto-set
    upd = client.patch(f"/api/payments/{p['id']}", headers=admin_headers, json={"status": "PAID"}).json()
    assert upd["status"] == "PAID" and upd["paid_date"]

    client.delete(f"/api/payments/{p['id']}", headers=admin_headers)
    assert len(client.get(f"/api/payments?contract_id={sr}", headers=admin_headers).json()["payments"]) == 0


def test_spend_summary_aggregates(client, admin_headers):
    sr = _seed(value=500000, savings=50000)
    client.post("/api/payments", headers=admin_headers, json={"contract_id": sr, "amount": 100000, "status": "PAID"})
    client.post("/api/payments", headers=admin_headers, json={"contract_id": sr, "amount": 60000, "status": "SCHEDULED"})
    client.post("/api/payments", headers=admin_headers, json={"contract_id": sr, "amount": 40000, "status": "INVOICED"})

    s = client.get("/api/payments/summary", headers=admin_headers).json()
    inr = next(b for b in s["by_currency"] if b["currency"] == "INR")
    assert inr["spend_under_management"] >= 500000
    assert inr["paid"] >= 100000
    assert inr["outstanding"] >= 100000   # scheduled 60k + invoiced 40k
    assert inr["savings"] >= 50000


def test_savings_amount_persists_on_contract(client, admin_headers):
    sr = _seed()
    client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"savings_amount": 12345})
    detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert detail["savings_amount"] == 12345
