"""Configurable multi-stage approval policy: conditional, sequential, role-based."""
import json


def _set_policy(client, admin_headers, stages):
    r = client.put("/api/settings", headers=admin_headers,
                   json={"values": {"approval_policy": json.dumps(stages)}})
    assert r.status_code == 200, r.text


def _draft(client, admin_headers, value):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
               json={"fields": {"contract_value": value, "contract_type": "MSA"}, "rev": d["rev"]})
    return d["id"]


def test_conditional_sequential_policy(client, admin_headers):
    _set_policy(client, admin_headers, [
        {"key": "legal", "name": "Legal review", "approver_role": "LEGAL", "order": 1,
         "condition": {"type": "always"}},
        {"key": "finance", "name": "Finance sign-off", "approver_role": "APPROVER", "order": 2,
         "condition": {"type": "value_gte", "value": 100000}},
    ])
    try:
        # Low-value draft: only the legal stage applies.
        low = _draft(client, admin_headers, 5000)
        st = client.get(f"/api/esign/drafts/{low}/approvals", headers=admin_headers).json()
        assert [s["gate"] for s in st["required"]] == ["legal"]

        # High-value draft: both stages apply, finance is order 2.
        hi = _draft(client, admin_headers, 250000)
        client.post(f"/api/esign/drafts/{hi}/request-approvals", headers=admin_headers)
        st = client.get(f"/api/esign/drafts/{hi}/approvals", headers=admin_headers).json()
        stages = {s["gate"]: s for s in st["required"]}
        assert set(stages) == {"legal", "finance"}
        # Sequential: legal is active now, finance is not (order 2 waits on order 1).
        assert stages["legal"]["active"] is True
        assert stages["finance"]["active"] is False
        assert st["satisfied"] is False

        # Approving finance before legal is blocked.
        fin_id = stages["finance"]["approval_id"]
        early = client.post(f"/api/esign/approvals/{fin_id}/decide", headers=admin_headers,
                            json={"status": "APPROVED"})
        assert early.status_code == 409

        # Approve legal, then finance becomes active and can be approved.
        client.post(f"/api/esign/approvals/{stages['legal']['approval_id']}/decide",
                    headers=admin_headers, json={"status": "APPROVED"})
        st = client.get(f"/api/esign/drafts/{hi}/approvals", headers=admin_headers).json()
        fin = next(s for s in st["required"] if s["gate"] == "finance")
        assert fin["active"] is True
        ok = client.post(f"/api/esign/approvals/{fin['approval_id']}/decide",
                         headers=admin_headers, json={"status": "APPROVED"})
        assert ok.status_code == 200
        st = client.get(f"/api/esign/drafts/{hi}/approvals", headers=admin_headers).json()
        assert st["satisfied"] is True
    finally:
        _set_policy2(client, admin_headers)


def _set_policy2(client, admin_headers):
    client.put("/api/settings", headers=admin_headers, json={"values": {"approval_policy": ""}})
