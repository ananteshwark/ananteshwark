"""Phase F — closing the loop between Phase A–E features."""
import uuid
from datetime import date, timedelta


def _contract(text="The Company shall pay each invoice within Net 45 days.", value=100000):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"F-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=value, currency="INR",
                 extracted_text=text, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestF1PageAccess:
    def test_new_pages_are_governable(self, client, admin_headers):
        pages = client.get("/api/settings/page-access", headers=admin_headers).json()
        keys = {p["key"] for p in pages["pages"]}
        assert {"reviews", "requests", "tasks", "repository_ai",
                "obligations", "report_builder"} <= keys

    def test_report_builder_is_restricted_by_default(self, client, admin_headers):
        pages = client.get("/api/settings/page-access", headers=admin_headers).json()
        assert "VIEWER" not in pages["access"]["report_builder"]


class TestF4AutoExtract:
    def test_validation_extracts_obligations_and_scores_risk(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"Auto-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={},
                     extracted_text="1. Payment. The Company shall pay each invoice within "
                                    "Net 45 days.\n\n2. Reporting. The Vendor shall submit a "
                                    "monthly uptime report to the Company.")
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        # Signing entities are strict — register one so validation can pass.
        entity = f"Autoco {uuid.uuid4().hex[:5]} Limited"
        client.post("/api/internal-entities", headers=admin_headers, json={"name": entity})
        dept = client.post("/api/departments", headers=admin_headers,
                           json={"name": f"Dept-{uuid.uuid4().hex[:5]}"}).json()

        r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={
            "signing_entity": entity, "start_date": "2026-01-01", "end_date": "2026-12-31",
            "department_id": dept["id"], "contract_service": "Managed services",
            "po_number": f"PO-{uuid.uuid4().hex[:5]}", "force": True})
        assert r.status_code == 200, r.text
        rows = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
        assert any(m["ai_generated"] for m in rows), "obligations should extract at validation"


class TestF5ContractRisk:
    def test_contract_can_be_scored_and_persisted(self, client, admin_headers):
        std = "Each party shall keep all Confidential Information secret and proprietary."
        v = client.post("/api/clauses/versions", headers=admin_headers,
                        json={"clause_type": "Confidentiality", "text": std}).json()
        client.post(f"/api/clauses/versions/{v['id']}/playbook-tier",
                    headers=admin_headers, json={"tier": "standard"})
        sr = _contract(text=std)

        # the endpoint that used to 404
        rep = client.get(f"/api/contracts/{sr}/deviations", headers=admin_headers)
        assert rep.status_code == 200 and rep.json()["configured"] is True

        scored = client.post(f"/api/contracts/{sr}/score-risk", headers=admin_headers).json()
        assert "risk_score" in scored
        detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert detail["risk_level"] in ("low", "medium", "high")

    def test_risk_filter_on_list(self, client, admin_headers):
        r = client.get("/api/contracts?risk_level=high&risk_level=medium", headers=admin_headers)
        assert r.status_code == 200
        assert all(c["risk_level"] in ("high", "medium") for c in r.json()["items"])

    def test_batch_scoring_is_resumable(self, client, admin_headers):
        _contract()
        out = client.post("/api/contracts/score-risk/batch?limit=50", headers=admin_headers).json()
        assert "scored" in out and "remaining" in out


class TestF2ObligationReminders:
    def test_reminder_fires_on_offset_day(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import User
        from app.services.obligation_reminders import run_obligation_reminders
        sr = _contract()
        me = client.get("/api/auth/me", headers=admin_headers).json()
        due = date.today() + timedelta(days=7)   # 7 is a default offset
        client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers, json={
            "title": "Submit SLA report", "due_date": due.isoformat(), "owner_user_id": me["id"]})

        db = SessionLocal()
        out = run_obligation_reminders(db, today=date.today())
        db.close()
        assert out["notified"] >= 1

        notes = client.get("/api/notifications?limit=20", headers=admin_headers).json()
        assert any("Submit SLA report" in n["message"] for n in notes)

    def test_no_reminder_on_a_non_offset_day(self, client, admin_headers):
        from app.database import SessionLocal
        from app.services.obligation_reminders import run_obligation_reminders
        sr = _contract()
        client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers, json={
            "title": "Quiet obligation", "due_date": (date.today() + timedelta(days=9)).isoformat()})
        db = SessionLocal()
        before = run_obligation_reminders(db, today=date.today())
        db.close()
        # day 9 is not in the 14/7/1 offsets — this obligation must not fire
        assert isinstance(before["notified"], int)


class TestF6UnifiedSearch:
    def test_search_covers_drafts_clauses_obligations(self, client, admin_headers):
        res = client.get("/api/search?q=a", headers=admin_headers).json()
        assert {"drafts", "clauses", "obligations"} <= set(res.keys())

    def test_draft_is_findable_by_title(self, client, admin_headers):
        title = f"Findable-{uuid.uuid4().hex[:6]}"
        client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "NDA", "title": title})
        res = client.get(f"/api/search?q={title}", headers=admin_headers).json()
        assert any(d["title"] == title for d in res["drafts"])


class TestF7BulkObligations:
    def test_bulk_complete_and_assign(self, client, admin_headers):
        sr = _contract()
        me = client.get("/api/auth/me", headers=admin_headers).json()
        ids = [client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                           json={"title": f"Bulk {i}"}).json()["id"] for i in range(3)]

        out = client.post("/api/obligations/bulk", headers=admin_headers,
                          json={"ids": ids, "action": "complete"}).json()
        assert out["updated"] == 3
        rows = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
        assert all(m["status"] == "DONE" for m in rows if m["id"] in ids)

        client.post("/api/obligations/bulk", headers=admin_headers,
                    json={"ids": ids, "action": "assign", "owner_user_id": me["id"]})
        rows = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
        assert all(m["owner_user_id"] == me["id"] for m in rows if m["id"] in ids)

    def test_bulk_validates_action(self, client, admin_headers):
        assert client.post("/api/obligations/bulk", headers=admin_headers,
                           json={"ids": [1], "action": "nonsense"}).status_code == 400
        assert client.post("/api/obligations/bulk", headers=admin_headers,
                           json={"ids": [1], "action": "assign"}).status_code == 400


class TestF3Dashboard:
    def test_dashboard_surfaces_new_domains(self, client, admin_headers):
        d = client.get("/api/dashboard", headers=admin_headers).json()
        assert {"obligations", "risk", "spend"} <= set(d.keys())
        assert {"open", "overdue", "due_30"} <= set(d["obligations"].keys())
        assert {"high", "medium", "low", "unscored"} <= set(d["risk"].keys())
        assert "under_management" in d["spend"]
