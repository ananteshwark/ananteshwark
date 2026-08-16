"""D1/G4 — cross-contract obligation portfolio view + stats + owner assignment."""
import uuid


def _seed_contract():
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Port-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_portfolio_lists_across_contracts(client, admin_headers):
    a, b = _seed_contract(), _seed_contract()
    client.post(f"/api/contracts/{a}/milestones", headers=admin_headers,
                json={"title": "Pay invoice", "obligation_type": "payment", "owner_party": "us",
                      "due_date": "2020-01-01"})
    client.post(f"/api/contracts/{b}/milestones", headers=admin_headers,
                json={"title": "Deliver SLA report", "obligation_type": "sla", "owner_party": "counterparty"})

    res = client.get("/api/obligations", headers=admin_headers).json()
    titles = {o["title"] for o in res["obligations"]}
    assert {"Pay invoice", "Deliver SLA report"} <= titles
    # overdue flag on the past-due one
    pay = next(o for o in res["obligations"] if o["title"] == "Pay invoice")
    assert pay["overdue"] is True and pay["contract_id"] == a

    # type filter
    sla = client.get("/api/obligations?obligation_type=sla", headers=admin_headers).json()
    assert all(o["obligation_type"] == "sla" for o in sla["obligations"])
    # overdue filter
    od = client.get("/api/obligations?overdue=true", headers=admin_headers).json()
    assert any(o["title"] == "Pay invoice" for o in od["obligations"])


def test_owner_assignment_and_mine_filter(client, admin_headers):
    sr = _seed_contract()
    me = client.get("/api/auth/me", headers=admin_headers).json()
    m = client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                    json={"title": "My obligation", "owner_user_id": me["id"]}).json()
    assert m["owner_user_id"] == me["id"] and m["owner_user_name"]
    mine = client.get("/api/obligations?owner=me", headers=admin_headers).json()
    assert any(o["id"] == m["id"] for o in mine["obligations"])


def test_stats_summary(client, admin_headers):
    sr = _seed_contract()
    client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                json={"title": "Renewal notice", "obligation_type": "renewal", "due_date": "2020-06-01"})
    s = client.get("/api/obligations/stats", headers=admin_headers).json()
    assert s["total"] >= 1 and s["overdue"] >= 1
    assert any(t["type"] == "renewal" for t in s["by_type"])
