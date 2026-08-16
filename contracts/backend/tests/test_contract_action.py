"""Expiry-reminder renew/terminate token flow, renewal dedupe, and draft stage."""
from app.models import ContractStatus, LifecycleStatus


def _contract(client, admin_headers, **kw):
    from app.database import SessionLocal
    from app.models import Contract
    from datetime import date
    db = SessionLocal()
    c = Contract(vendor_name_raw=kw.get("vendor", "TokenCo"), contract_service="teleradiology",
                 signing_entity="IKS Health", contract_type="MSA",
                 status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                 start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
                 raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def _token(sr):
    from app.database import SessionLocal
    from app.models import Contract
    from app.services.contract_actions import mint_token
    db = SessionLocal()
    tok = mint_token(db, db.get(Contract, sr)).token
    db.commit(); db.close()
    return tok


class TestContractActionToken:
    def test_open_returns_details_and_defaults(self, client, admin_headers):
        sr = _contract(client, admin_headers)
        tok = _token(sr)
        r = client.get(f"/api/contract-action/{tok}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["contract"]["sr_no"] == sr
        rd = body["renewal_defaults"]
        # start = current end + 1 day, end = start + same term length
        assert rd["start_date"] == "2026-01-01"
        assert rd["end_date"] == "2026-12-31"
        assert rd["contract_type"] == "MSA"

    def test_terminate_marks_contract(self, client, admin_headers):
        sr = _contract(client, admin_headers)
        tok = _token(sr)
        r = client.post(f"/api/contract-action/{tok}/terminate")
        assert r.status_code == 200 and r.json()["decision"] == "TERMINATE"
        c = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert c["lifecycle_status"] == "TERMINATED"
        # single-use: the token is now spent
        assert client.get(f"/api/contract-action/{tok}").status_code == 403

    def test_renew_queues_a_draft(self, client, admin_headers):
        sr = _contract(client, admin_headers)
        tok = _token(sr)
        r = client.post(f"/api/contract-action/{tok}/renew", json={
            "signing_entity": "IKS Health", "contract_type": "MSA",
            "contract_service": "teleradiology + nighthawk", "phi_shared": True,
        })
        assert r.status_code == 200 and r.json()["decision"] == "RENEW"
        did = r.json()["draft_id"]
        d = client.get(f"/api/authoring/drafts/{did}", headers=admin_headers).json()
        assert d["link_as"] == "renewal" and d["renews_contract_id"] == sr
        assert d["fields"]["phi_shared"] is True
        assert d["origin"] == "renewal"


class TestRenewalDedupe:
    def test_renew_button_reuses_pending_draft(self, client, admin_headers):
        sr = _contract(client, admin_headers)
        first = client.post("/api/authoring/drafts", headers=admin_headers,
                            json={"origin": "duplicate", "source_contract_id": sr, "link_as": "renewal"}).json()
        second = client.post("/api/authoring/drafts", headers=admin_headers,
                             json={"origin": "duplicate", "source_contract_id": sr, "link_as": "renewal"}).json()
        assert second.get("reused") is True
        assert second["id"] == first["id"]


class TestDraftStage:
    def test_new_draft_starts_at_stage_zero(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        assert d["stage_index"] == 0
        assert d["stage"] == d["stages"][0]
        assert len(d["stages"]) == 6


class TestAutoRenewal:
    def test_auto_drafts_due_renewals_deduped(self, client, admin_headers):
        from datetime import date, timedelta
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        from app.services.contract_actions import auto_draft_due_renewals, find_pending_renewal_draft

        db = SessionLocal()
        today = date(2026, 6, 1)
        # Expires in 30 days → within a 60-day window.
        due = Contract(vendor_name_raw="AutoRenew", contract_service="svc", contract_type="MSA",
                       status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                       start_date=today - timedelta(days=335), end_date=today + timedelta(days=30),
                       raw_extracted={}, confidence={})
        # Expires in 200 days → outside the window.
        far = Contract(vendor_name_raw="NotYet", contract_service="svc",
                       status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                       start_date=today, end_date=today + timedelta(days=200),
                       raw_extracted={}, confidence={})
        db.add_all([due, far]); db.commit(); due_sr = due.sr_no; db.close()

        n = 0
        db = SessionLocal()
        n = auto_draft_due_renewals(db, today, lead_days=60)
        db.close()
        assert n >= 1

        db = SessionLocal()
        assert find_pending_renewal_draft(db, due_sr) is not None
        # Running again does not stack a second draft for the same contract.
        n2 = auto_draft_due_renewals(db, today, lead_days=60)
        db.close()
        assert n2 == 0
