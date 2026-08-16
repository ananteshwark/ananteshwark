"""R2: bulk redline decisions, approval-before-share gate, cross-vendor insights."""


def _draft(client, h, ctype="MSA"):
    return client.post("/api/authoring/drafts", headers=h, json={"origin": "scratch", "contract_type": ctype}).json()


# Text that classifies to a known clause type (vendor side classifies from text).
_CLAUSE_TEXT = {
    "Indemnity": "The Vendor shall indemnify and hold harmless the Company against all claims.",
    "Limitation of Liability": "The liability of each party shall not exceed twelve months of fees.",
}


def _share_and_change(client, h, draft, ctype="Indemnity"):
    link = client.post(f"/api/authoring/drafts/{draft['id']}/share", headers=h,
                       json={"recipients": [{"email": "v@x.com"}]}).json()["links"][0]
    cid = client.post(f"/api/vendor/{link['token']}/changes", json={
        "change_type": "REPLACE",
        "original_text": _CLAUSE_TEXT.get(ctype, "The parties agree to the terms herein."),
        "proposed_text": "The revised terms apply."}).json()["id"]
    return cid


class TestBulkDecide:
    def test_bulk_accept(self, client, admin_headers):
        d = _draft(client, admin_headers)
        ids = [_share_and_change(client, admin_headers, d) for _ in range(2)]
        # note: sharing twice opens new rounds/links; both changes still on the draft
        r = client.post("/api/authoring/changes/bulk-decide", headers=admin_headers,
                        json={"change_ids": ids, "decision": "ACCEPTED"})
        assert r.status_code == 200 and r.json()["updated"] == 2
        changes = client.get(f"/api/authoring/drafts/{d['id']}/changes", headers=admin_headers).json()
        assert all(c["disposition"] == "ACCEPTED" for c in changes if c["id"] in ids)

    def test_bulk_reject_requires_reason(self, client, admin_headers):
        d = _draft(client, admin_headers)
        cid = _share_and_change(client, admin_headers, d)
        assert client.post("/api/authoring/changes/bulk-decide", headers=admin_headers,
                           json={"change_ids": [cid], "decision": "REJECTED"}).status_code == 400


class TestApprovalBeforeShare:
    def test_share_blocked_until_approved(self, client, admin_headers):
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"require_approval_before_share": "true", "approval_require_legal": "true"}})
        d = _draft(client, admin_headers)
        blocked = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                              json={"recipients": [{"email": "v@x.com"}]})
        assert blocked.status_code == 403
        appr = client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=legal", headers=admin_headers).json()
        client.post(f"/api/esign/approvals/{appr['approval_id']}/decide", headers=admin_headers, json={"status": "APPROVED"})
        ok = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                         json={"recipients": [{"email": "v@x.com"}]})
        assert ok.status_code == 200
        # reset
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"require_approval_before_share": "false", "approval_require_legal": "false"}})


class TestInsights:
    def test_most_challenged_endpoint(self, client, admin_headers):
        d = _draft(client, admin_headers)
        cid = _share_and_change(client, admin_headers, d, ctype="Limitation of Liability")
        client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                    json={"decision": "REJECTED", "reason": "no"})
        rows = client.get("/api/authoring/insights/most-challenged", headers=admin_headers).json()
        row = next(r for r in rows if r["clause_type"] == "Limitation of Liability")
        assert row["challenged"] >= 1 and row["rejected"] >= 1
