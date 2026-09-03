"""Change 6: flag clauses not in the company's favour."""
from app.services.contract_risk import analyze_contract_risk


def test_flags_vendor_favourable_clauses():
    text = (
        "1. Warranty. The services are provided AS IS and the supplier disclaims all warranties.\n\n"
        "2. Liability. In no event shall the Vendor be liable for any indirect damages.\n\n"
        "3. Term. This Agreement will automatically renew for successive one-year terms.\n\n"
        "4. Scope. The vendor shall provide managed IT services during business hours."
    )
    flagged = analyze_contract_risk(text)
    reasons = " ".join(r for f in flagged for r in f["reasons"]).lower()
    assert any("as is" in r or "warrant" in r for r in [x.lower() for f in flagged for x in f["reasons"]])
    assert "renew" in reasons  # auto-renewal flagged
    # the neutral scope clause is not flagged
    assert all("managed IT services" not in f["text"] for f in flagged)


def test_no_flags_on_clean_text():
    text = "1. Scope. The vendor shall deliver the services described in Schedule A."
    assert analyze_contract_risk(text) == []


def test_endpoint(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw="RiskVendor", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={},
                 extracted_text="1. Liability. The supplier's total liability shall not exceed the fees paid.")
    db.add(c); db.commit(); sr = c.sr_no; db.close()

    r = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    assert "text" in body and body["flagged"][0]["reasons"]
