"""Tests for contract obligations/milestones."""
from datetime import date, timedelta


class TestMilestones:
    def _contract(self):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="MsVendor", contract_service="svc",
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_crud_and_completion(self, client, admin_headers):
        sr = self._contract()
        overdue = (date.today() - timedelta(days=2)).isoformat()
        m = client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                        json={"title": "Submit SLA report", "due_date": overdue}).json()
        assert m["title"] == "Submit SLA report"
        assert m["overdue"] is True  # pending + past due

        listed = client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json()
        assert len(listed) == 1

        # mark done -> not overdue anymore, completion recorded
        done = client.patch(f"/api/contracts/{sr}/milestones/{m['id']}", headers=admin_headers,
                            json={"status": "DONE"}).json()
        assert done["status"] == "DONE" and done["completed_at"] and done["overdue"] is False

        # reopen
        reopened = client.patch(f"/api/contracts/{sr}/milestones/{m['id']}", headers=admin_headers,
                               json={"status": "PENDING"}).json()
        assert reopened["status"] == "PENDING" and reopened["completed_at"] is None

        # delete (soft)
        assert client.delete(f"/api/contracts/{sr}/milestones/{m['id']}", headers=admin_headers).status_code == 200
        assert client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).json() == []

    def test_upcoming_dashboard_includes_due_soon(self, client, admin_headers):
        sr = self._contract()
        soon = (date.today() + timedelta(days=5)).isoformat()
        far = (date.today() + timedelta(days=400)).isoformat()
        client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                    json={"title": "DueSoonMs", "due_date": soon})
        client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                    json={"title": "FarMs", "due_date": far})

        up = client.get("/api/dashboard/upcoming-milestones?days=30", headers=admin_headers).json()
        titles = {m["title"] for m in up}
        assert "DueSoonMs" in titles and "FarMs" not in titles

    def test_invalid_status_rejected(self, client, admin_headers):
        sr = self._contract()
        m = client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                        json={"title": "X"}).json()
        r = client.patch(f"/api/contracts/{sr}/milestones/{m['id']}", headers=admin_headers,
                         json={"status": "BOGUS"})
        assert r.status_code == 400
