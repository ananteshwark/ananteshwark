"""Test the validator workload dashboard endpoint."""
from datetime import datetime, timedelta, timezone


class TestWorkload:
    def _make_validator(self, client, admin_headers, email):
        return client.post("/api/auth/users", headers=admin_headers,
                           json={"email": email, "name": "WL User", "password": "password123",
                                 "role": "VALIDATOR"}).json()["id"]

    def test_groups_pending_by_assignee_with_stale(self, client, admin_headers):
        uid = self._make_validator(client, admin_headers, "wl1@example.com")
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        # one fresh assigned, one stale assigned, one unassigned
        fresh = Contract(vendor_name_raw="F", contract_service="s", assignee_id=uid,
                         status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        stale = Contract(vendor_name_raw="S", contract_service="s", assignee_id=uid,
                         status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={},
                         created_at=datetime.now(timezone.utc) - timedelta(days=30))
        una = Contract(vendor_name_raw="U", contract_service="s",
                       status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add_all([fresh, stale, una]); db.commit(); db.close()

        wl = client.get("/api/dashboard/workload", headers=admin_headers).json()
        assert wl["total_pending"] >= 3
        assert wl["unassigned_pending"] >= 1

        row = next(r for r in wl["rows"] if r["assignee_id"] == uid)
        assert row["pending"] == 2
        assert row["stale"] == 1
        assert row["assignee_name"] == "WL User"

        assert any(r["unassigned"] for r in wl["rows"])
