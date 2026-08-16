"""D3/G7 — admin-defined custom fields + per-contract values."""
import uuid


def _seed():
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"CF-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_field_def_crud_and_scoping(client, admin_headers):
    f = client.post("/api/custom-fields", headers=admin_headers, json={
        "label": "Risk Rating", "field_type": "select", "options": ["Low", "Medium", "High"],
        "applies_to_type": "MSA", "required": True}).json()
    assert f["key"] == "risk_rating" and f["field_type"] == "select"

    g = client.post("/api/custom-fields", headers=admin_headers, json={
        "label": "Cost Center", "field_type": "text"}).json()  # applies to all

    # dupe key rejected
    assert client.post("/api/custom-fields", headers=admin_headers,
                       json={"label": "Risk Rating"}).status_code == 409

    # scoping: MSA sees both; NDA sees only the all-types one
    msa = client.get("/api/custom-fields?contract_type=MSA", headers=admin_headers).json()
    nda = client.get("/api/custom-fields?contract_type=NDA", headers=admin_headers).json()
    assert {x["key"] for x in msa} >= {"risk_rating", "cost_center"}
    assert "risk_rating" not in {x["key"] for x in nda}
    assert "cost_center" in {x["key"] for x in nda}

    # update + soft delete
    client.put(f"/api/custom-fields/{g['id']}", headers=admin_headers, json={"label": "Cost Centre"})
    assert client.delete(f"/api/custom-fields/{f['id']}", headers=admin_headers).json()["ok"] is True
    keys = {x["key"] for x in client.get("/api/custom-fields", headers=admin_headers).json()}
    assert "risk_rating" not in keys


def test_custom_values_persist_on_contract(client, admin_headers):
    client.post("/api/custom-fields", headers=admin_headers, json={"label": "Region", "field_type": "text"})
    sr = _seed()
    client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"custom_fields": {"region": "APAC"}})
    detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert detail["custom_fields"]["region"] == "APAC"
