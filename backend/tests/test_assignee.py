"""Tests for the contract assignee workflow."""


class TestAssignee:
    def _contract(self):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="AssignVendor", contract_service="svc",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def _make_user(self, client, admin_headers, role="VALIDATOR", email=None):
        email = email or f"assignee_{role.lower()}@example.com"
        r = client.post("/api/auth/users", headers=admin_headers,
                        json={"email": email, "name": f"{role} User", "password": "password123", "role": role})
        return r.json()["id"]

    def test_assignable_users_lists_validators_and_admins(self, client, admin_headers):
        self._make_user(client, admin_headers, "VALIDATOR", "av1@example.com")
        self._make_user(client, admin_headers, "VIEWER", "aviewer@example.com")
        users = client.get("/api/auth/assignable-users", headers=admin_headers).json()
        roles = {u["role"] for u in users}
        assert "VALIDATOR" in roles and "ADMIN" in roles
        assert "VIEWER" not in roles

    def test_assign_and_unassign(self, client, admin_headers):
        sr = self._contract()
        uid = self._make_user(client, admin_headers, "VALIDATOR", "av2@example.com")

        r = client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": uid})
        assert r.status_code == 200 and r.json()["assignee_id"] == uid
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert got["assignee_id"] == uid and got["assignee_name"] == "VALIDATOR User"

        # unassign
        r = client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": None})
        assert r.json()["assignee_id"] is None

    def test_cannot_assign_a_viewer(self, client, admin_headers):
        sr = self._contract()
        vid = self._make_user(client, admin_headers, "VIEWER", "av3@example.com")
        r = client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": vid})
        assert r.status_code == 400

    def test_queue_filter_by_assignee(self, client, admin_headers):
        sr = self._contract()
        uid = self._make_user(client, admin_headers, "VALIDATOR", "av4@example.com")
        client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": uid})

        assigned = client.get(f"/api/contracts/validation-queue?assignee_id={uid}", headers=admin_headers).json()
        assert any(c["sr_no"] == sr for c in assigned)
        # unassigned filter (0) excludes it
        unassigned = client.get("/api/contracts/validation-queue?assignee_id=0", headers=admin_headers).json()
        assert all(c["sr_no"] != sr for c in unassigned)

    def test_bulk_assign_user(self, client, admin_headers):
        sr1, sr2 = self._contract(), self._contract()
        uid = self._make_user(client, admin_headers, "VALIDATOR", "av5@example.com")
        r = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1, sr2], "action": "assign_user", "user_id": uid,
        })
        assert r.status_code == 200 and r.json()["updated_count"] == 2
        # re-assigning the same user is a no-op
        r2 = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "assign_user", "user_id": uid})
        assert r2.json()["updated_count"] == 0
        assert r2.json()["skipped"][0]["reason"] == "no assignee change"
