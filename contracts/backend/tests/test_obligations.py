"""C4/G4 — AI obligation extraction into the milestone register (offline path)."""
import uuid

_TEXT = (
    "1. Payment Terms. The Company shall pay each invoice within Net 45 days of receipt.\n\n"
    "2. Reporting. The Vendor shall submit a monthly SLA report detailing uptime and incidents.\n\n"
    "3. Service Levels. The Provider guarantees 99.9% uptime availability measured monthly.\n\n"
    "4. Renewal. This agreement shall auto-renew for successive one-year terms unless either "
    "party gives 60 days' notice.\n\n"
    "5. Insurance. The Vendor shall maintain commercial general liability insurance of $2,000,000.\n\n"
    "The weather in the valley is pleasant this time of year."
)


def _seed(text=_TEXT):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Ob-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, extracted_text=text,
                 raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_deterministic_extract_classifies(client):
    from app.database import SessionLocal
    from app.models import Contract
    from app.services.obligations import extract_obligations
    sr = _seed()
    db = SessionLocal()
    c = db.get(Contract, sr)
    out = extract_obligations(db, c)
    db.commit()
    assert out["ai"] is False and out["created"] >= 4
    types = {o["obligation_type"] for o in out["obligations"]}
    assert {"payment", "report", "renewal", "sla"} & types
    # payment obligation owned by us (Company shall pay)
    pay = next(o for o in out["obligations"] if o["obligation_type"] == "payment")
    assert pay["owner_party"] == "us"
    db.close()


def test_extract_endpoint_and_register(client, admin_headers):
    sr = _seed()
    r = client.post(f"/api/contracts/{sr}/obligations/extract", headers=admin_headers).json()
    assert r["created"] >= 4
    rows = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
    ai_rows = [m for m in rows if m["ai_generated"]]
    assert len(ai_rows) >= 4
    assert any(m["obligation_type"] == "sla" for m in ai_rows)


def test_reextract_refreshes_without_duplicating(client, admin_headers):
    sr = _seed()
    client.post(f"/api/contracts/{sr}/obligations/extract", headers=admin_headers)
    first = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
    client.post(f"/api/contracts/{sr}/obligations/extract", headers=admin_headers)
    second = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
    # re-running replaces the pending AI suggestions rather than piling up
    assert len([m for m in second if m["ai_generated"]]) == len([m for m in first if m["ai_generated"]])


def test_manual_milestone_preserved_on_reextract(client, admin_headers):
    sr = _seed()
    client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                json={"title": "Kickoff meeting", "due_date": "2026-01-15"})
    client.post(f"/api/contracts/{sr}/obligations/extract", headers=admin_headers)
    rows = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
    assert any(m["title"] == "Kickoff meeting" and not m["ai_generated"] for m in rows)
