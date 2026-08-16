"""Vendor Collaboration — tokenized links, tracked changes, dispositions, ledger."""


def _draft(client, headers, ctype="MSA"):
    return client.post("/api/authoring/drafts", headers=headers,
                       json={"origin": "scratch", "contract_type": ctype}).json()


class TestShareAndTokenScope:
    def test_share_creates_token_and_public_open(self, client, admin_headers):
        d = _draft(client, admin_headers)
        r = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers, json={
            "recipients": [{"email": "legal@vendor.com", "name": "Vendor Legal"}],
            "access": "SUGGEST", "expires_days": 7,
        })
        assert r.status_code == 200, r.text
        token = r.json()["links"][0]["token"]

        # Public open (no auth) returns only this draft's sanitized data
        pub = client.get(f"/api/vendor/{token}")
        assert pub.status_code == 200
        body = pub.json()
        assert body["title"] == d["title"] and body["access"] == "SUGGEST"
        assert "document" in body and "fields" not in body   # internal fields not exposed

    def test_revoked_and_expired_links_blocked(self, client, admin_headers):
        d = _draft(client, admin_headers)
        link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers, json={
            "recipients": [{"email": "a@v.com"}]}).json()["links"][0]
        client.post(f"/api/authoring/shares/{link['id']}/revoke", headers=admin_headers)
        assert client.get(f"/api/vendor/{link['token']}").status_code == 403

    def test_new_round_invalidates_prior_token(self, client, admin_headers):
        d = _draft(client, admin_headers)
        first = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers, json={
            "recipients": [{"email": "a@v.com"}]}).json()["links"][0]
        # sharing again opens a new round and revokes the old link
        client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers, json={
            "recipients": [{"email": "a@v.com"}]})
        assert client.get(f"/api/vendor/{first['token']}").status_code == 403


class TestTrackedChangesAndDisposition:
    def _share(self, client, headers, access="SUGGEST"):
        d = _draft(client, headers)
        link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=headers, json={
            "recipients": [{"email": "legal@vendor.com"}], "access": access}).json()["links"][0]
        return d, link

    def test_vendor_submits_change_with_risk_commentary(self, client, admin_headers):
        d, link = self._share(client, admin_headers)
        r = client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "DELETE",
            "original_text": "The liability of each party shall not exceed twelve months of fees.",
            "rationale": "Vendor prefers no cap.",
        })
        assert r.status_code == 200, r.text
        assert r.json()["clause_type"] == "Limitation of Liability"

        # Internal redline shows the change with risk commentary + suggested response
        changes = client.get(f"/api/authoring/drafts/{d['id']}/changes", headers=admin_headers).json()
        assert len(changes) == 1
        assert "liability cap" in changes[0]["risk_commentary"].lower()
        assert changes[0]["suggested_response"]

    def test_comment_only_link_rejects_edits(self, client, admin_headers):
        d, link = self._share(client, admin_headers, access="COMMENT")
        assert client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "REPLACE", "original_text": "x", "proposed_text": "y"}).status_code == 403
        # but a comment is allowed
        assert client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "COMMENT", "rationale": "Please clarify."}).status_code == 200

    def test_reject_requires_reason_and_records_disposition(self, client, admin_headers):
        d, link = self._share(client, admin_headers)
        cid = client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "REPLACE", "original_text": "a", "proposed_text": "b"}).json()["id"]
        # reject without reason -> 400
        assert client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                           json={"decision": "REJECTED"}).status_code == 400
        ok = client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                         json={"decision": "REJECTED", "reason": "Weakens our position."})
        assert ok.status_code == 200 and ok.json()["disposition"] == "REJECTED"

    def test_ledger_and_inbox_and_submit(self, client, admin_headers):
        d, link = self._share(client, admin_headers)
        client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "REPLACE", "clause_type": "Indemnity",
            "original_text": "vendor shall indemnify", "proposed_text": "no indemnity"})
        # vendor returns the round
        assert client.post(f"/api/vendor/{link['token']}/submit").json()["ok"] is True
        # inbox surfaces the returned draft
        inbox = client.get("/api/authoring/inbox", headers=admin_headers).json()
        assert any(x["draft_id"] == d["id"] for x in inbox)
        # ledger lists the round + change
        ledger = client.get(f"/api/authoring/drafts/{d['id']}/ledger", headers=admin_headers).json()
        assert ledger["rounds"][0]["status"] == "RETURNED"
        assert len(ledger["rounds"][0]["changes"]) == 1
