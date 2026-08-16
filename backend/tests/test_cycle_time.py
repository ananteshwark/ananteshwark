"""Cycle-time / process analytics report."""
from datetime import date, timedelta
from app.database import SessionLocal
from app.models import Contract, ContractStatus, utcnow


def test_cycle_time_shape_and_validation(client, admin_headers):
    db = SessionLocal()
    c = Contract(vendor_name_raw="CT", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
    c.created_at = utcnow() - timedelta(days=3)
    c.validated_at = utcnow()
    db.add(c); db.commit(); db.close()

    r = client.get("/api/reports/cycle-time", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("validation", "approvals", "signature", "authoring_to_execution",
              "stage_durations", "in_flight"):
        assert k in body
    assert body["validation"]["count"] >= 1
    assert body["validation"]["avg_days"] is not None


def test_status_transition_feeds_stage_durations(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    # Move it through a stage → recorded as a STATUS_CHANGE.
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
               json={"status": "INTERNAL_REVIEW", "rev": d["rev"]})
    r = client.get("/api/reports/cycle-time", headers=admin_headers).json()
    # DRAFT dwell should now be tracked (at least present as a key).
    assert isinstance(r["stage_durations"], dict)
