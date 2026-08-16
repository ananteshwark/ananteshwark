"""Per-department approval-gate configuration overrides the global defaults."""
import uuid


def _dept(client, admin_headers, **cfg):
    name = f"ApprDept-{uuid.uuid4().hex[:6]}"
    r = client.post("/api/departments", headers=admin_headers, json={"name": name, **cfg})
    assert r.status_code == 200, r.text
    return r.json()


def _draft(client, admin_headers, dept_id, value):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
               json={"department_id": dept_id, "fields": {"contract_value": value, "vendor": "Acme"}})
    return d


class TestDepartmentGates:
    def test_department_legal_gate_overrides_global_off(self, client, admin_headers):
        # Global legal gate is off by default; department forces it on.
        dept = _dept(client, admin_headers, approval_require_legal=True)
        assert dept["approval_require_legal"] is True
        d = _draft(client, admin_headers, dept["id"], 1000)
        gates = client.get(f"/api/esign/drafts/{d['id']}/approvals", headers=admin_headers).json()
        names = [g["gate"] for g in gates["required"]]
        assert "legal" in names and gates["satisfied"] is False

    def test_department_finance_threshold_applies(self, client, admin_headers):
        dept = _dept(client, admin_headers, approval_value_threshold=100000)
        # Below threshold -> no finance gate
        low = _draft(client, admin_headers, dept["id"], 50000)
        assert client.get(f"/api/esign/drafts/{low['id']}/approvals", headers=admin_headers).json()["required"] == []
        # At/above threshold -> finance gate required
        high = _draft(client, admin_headers, dept["id"], 500000)
        names = [g["gate"] for g in client.get(f"/api/esign/drafts/{high['id']}/approvals", headers=admin_headers).json()["required"]]
        assert names == ["finance"]

    def test_department_none_inherits_global(self, client, admin_headers):
        # Turn the global legal gate on; a department that doesn't override inherits it.
        client.put("/api/settings", headers=admin_headers, json={"values": {"approval_require_legal": "true"}})
        dept = _dept(client, admin_headers)   # no per-dept override
        d = _draft(client, admin_headers, dept["id"], 1000)
        names = [g["gate"] for g in client.get(f"/api/esign/drafts/{d['id']}/approvals", headers=admin_headers).json()["required"]]
        assert "legal" in names
        # A department that explicitly turns legal off wins over the global.
        dept_off = _dept(client, admin_headers, approval_require_legal=False)
        d2 = _draft(client, admin_headers, dept_off["id"], 1000)
        names2 = [g["gate"] for g in client.get(f"/api/esign/drafts/{d2['id']}/approvals", headers=admin_headers).json()["required"]]
        assert "legal" not in names2
        # reset global so other tests are unaffected
        client.put("/api/settings", headers=admin_headers, json={"values": {"approval_require_legal": "false"}})

    def test_send_blocked_until_department_gate_satisfied(self, client, admin_headers):
        dept = _dept(client, admin_headers, approval_require_legal=True)
        d = _draft(client, admin_headers, dept["id"], 1000)
        signers = {"signers": [{"name": "A", "email": "a@x.com"}, {"name": "B", "email": "b@y.com"}]}
        assert client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=signers).status_code == 403
        appr = client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=legal", headers=admin_headers).json()
        client.post(f"/api/esign/approvals/{appr['approval_id']}/decide", headers=admin_headers, json={"status": "APPROVED"})
        assert client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=signers).status_code == 200
