"""Phase H — the AI proposes the edit, not just the finding."""
import uuid

STANDARD_INDEMNITY = (
    "The Vendor shall indemnify, defend and hold harmless the Company against all "
    "third party claims arising from the Vendor's performance of the Services.")
FALLBACK_INDEMNITY = (
    "The Vendor shall indemnify the Company for direct third party claims only, "
    "limited to twelve months of fees paid under this agreement.")


def _playbook(client, admin_headers, clause_type="Indemnity"):
    std = client.post("/api/clauses/versions", headers=admin_headers,
                      json={"clause_type": clause_type, "text": STANDARD_INDEMNITY}).json()
    fb = client.post("/api/clauses/versions", headers=admin_headers,
                     json={"clause_type": clause_type, "text": FALLBACK_INDEMNITY}).json()
    client.post(f"/api/clauses/versions/{std['id']}/playbook-tier",
                headers=admin_headers, json={"tier": "standard"})
    client.post(f"/api/clauses/versions/{fb['id']}/playbook-tier",
                headers=admin_headers, json={"tier": "fallback"})
    return std, fb


def _draft_with(client, admin_headers, body):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={"document": {
        "type": "doc", "content": [
            {"type": "heading", "content": [{"type": "text", "text": "Indemnity"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": body}]},
        ]}})
    return d["id"]


class TestH1AutoRedline:
    def test_off_playbook_clause_gets_a_proposal(self, client, admin_headers):
        _playbook(client, admin_headers)
        # Off-playbook *indemnity*: the obligation runs the wrong way and is uncapped.
        off = ("The Company shall indemnify and hold the Vendor harmless without any "
               "limit whatsoever for every loss, however arising.")
        did = _draft_with(client, admin_headers, off)

        out = client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers).json()
        assert out["configured"] is True
        assert out["proposed"] >= 1, "an off-playbook clause should get a concrete proposal"
        p = out["proposals"][0]
        assert p["proposed_text"], "the proposal must contain the actual replacement wording"
        assert p["rationale"]

    def test_proposal_is_a_reviewable_tracked_change(self, client, admin_headers):
        _playbook(client, admin_headers)
        did = _draft_with(client, admin_headers,
                          "The Company shall indemnify the Vendor without any limit at all.")
        client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers)
        changes = client.get(f"/api/authoring/drafts/{did}/changes", headers=admin_headers).json()
        auto = [c for c in changes if c["author_email"] == "playbook@auto-redline"]
        assert auto, "proposals should appear as tracked changes"
        assert all(c["disposition"] == "PENDING" for c in auto), "nothing is applied automatically"

    def test_rerunning_refreshes_rather_than_duplicating(self, client, admin_headers):
        _playbook(client, admin_headers)
        did = _draft_with(client, admin_headers,
                          "The Company shall indemnify the Vendor without any limit at all.")
        first = client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers).json()
        second = client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers).json()
        assert first["proposed"] == second["proposed"]
        changes = client.get(f"/api/authoring/drafts/{did}/changes", headers=admin_headers).json()
        auto = [c for c in changes if c["author_email"] == "playbook@auto-redline"]
        assert len(auto) == second["proposed"], "re-running must not pile up duplicates"

    def test_on_standard_clause_is_left_alone(self, client, admin_headers):
        _playbook(client, admin_headers)
        did = _draft_with(client, admin_headers, STANDARD_INDEMNITY)
        out = client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers).json()
        assert out["proposed"] == 0, "a clause already on standard needs no redline"

    def test_no_playbook_means_no_proposals(self, client, admin_headers):
        did = _draft_with(client, admin_headers, "Some unremarkable wording about widgets.")
        out = client.post(f"/api/authoring/drafts/{did}/auto-redline", headers=admin_headers).json()
        assert out["proposed"] == 0


class TestH2NegotiationCopilot:
    def _change(self, client, admin_headers, proposed, clause_type="Indemnity"):
        from app.database import SessionLocal
        from app.models import ChangeType, Disposition, TrackedChange
        did = _draft_with(client, admin_headers, "placeholder")
        db = SessionLocal()
        tc = TrackedChange(draft_id=did, change_type=ChangeType.REPLACE,
                           clause_type=clause_type, original_text="placeholder",
                           proposed_text=proposed, author_email="vendor@acme.test",
                           disposition=Disposition.PENDING)
        db.add(tc); db.commit(); cid = tc.id; db.close()
        return cid

    def test_standard_wording_is_recommended_for_acceptance(self, client, admin_headers):
        _playbook(client, admin_headers)
        cid = self._change(client, admin_headers, STANDARD_INDEMNITY)
        a = client.get(f"/api/authoring/changes/{cid}/advice", headers=admin_headers).json()
        assert a["recommendation"] == "accept"
        assert a["reply"]

    def test_off_playbook_wording_gets_a_counter(self, client, admin_headers):
        _playbook(client, admin_headers)
        cid = self._change(client, admin_headers,
                           "The Company shall indemnify the Vendor without limit for everything.")
        a = client.get(f"/api/authoring/changes/{cid}/advice", headers=admin_headers).json()
        assert a["recommendation"] in ("counter", "reject")
        if a["recommendation"] == "counter":
            assert a["counter_text"], "a counter must carry the wording we propose instead"
        assert a["rationale"]
        assert a["reply"]

    def test_advice_includes_counterparty_history(self, client, admin_headers):
        _playbook(client, admin_headers)
        cid = self._change(client, admin_headers, FALLBACK_INDEMNITY)
        a = client.get(f"/api/authoring/changes/{cid}/advice", headers=admin_headers).json()
        assert set(a["history"]) >= {"seen", "accepted", "rejected", "countered"}

    def test_unknown_change_404s(self, client, admin_headers):
        assert client.get("/api/authoring/changes/99999999/advice",
                          headers=admin_headers).status_code == 404


class TestH3IntakeCopilot:
    def test_reads_a_plain_language_request(self, client, admin_headers):
        r = client.post("/api/requests/interpret", headers=admin_headers, json={
            "text": "We urgently need an NDA with Globex Health before the pilot in March"}).json()
        f = r["fields"]
        assert f["contract_type"] == "NDA"
        assert "Globex" in (f["counterparty_name"] or "")
        assert f["priority"] == "high"
        assert f["needed_by"], "a stated deadline should be picked up"
        assert r["understood"] is True

    def test_extracts_value_and_currency(self, client, admin_headers):
        r = client.post("/api/requests/interpret", headers=admin_headers, json={
            "text": "Renew the MSA with Initech for $250,000 this year"}).json()
        f = r["fields"]
        assert f["contract_type"] == "MSA"
        assert f["estimated_value"] == 250000
        assert f["currency"] == "USD"

    def test_indian_scale_words(self, client, admin_headers):
        r = client.post("/api/requests/interpret", headers=admin_headers, json={
            "text": "SOW with Wipro worth 50 lakh"}).json()
        assert r["fields"]["estimated_value"] == 5000000

    def test_vague_request_is_flagged_low_confidence(self, client, admin_headers):
        r = client.post("/api/requests/interpret", headers=admin_headers,
                        json={"text": "please help with a thing"}).json()
        assert r["confidence"] < 0.5

    def test_empty_text_is_handled(self, client, admin_headers):
        r = client.post("/api/requests/interpret", headers=admin_headers, json={"text": "  "}).json()
        assert r["understood"] is False


class TestH4EmailApproval:
    def _draft_awaiting_approval(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=legal",
                    headers=admin_headers)
        return d["id"]

    def test_token_approves_without_signing_in(self, client, admin_headers):
        from app.api.approval_action_api import issue_token
        from app.database import SessionLocal
        from app.models import User
        did = self._draft_awaiting_approval(client, admin_headers)
        db = SessionLocal()
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        token = issue_token(db, did, "legal", admin)
        db.commit(); db.close()

        # No Authorization header anywhere in this flow.
        info = client.get(f"/api/approval-action/{token}").json()
        assert info["draft_id"] == did and info["stage"] == "legal"

        out = client.post(f"/api/approval-action/{token}/approve", json={"note": "fine by me"})
        assert out.status_code == 200, out.text
        assert out.json()["decision"] == "APPROVED"

    def test_token_is_single_use(self, client, admin_headers):
        from app.api.approval_action_api import issue_token
        from app.database import SessionLocal
        from app.models import User
        did = self._draft_awaiting_approval(client, admin_headers)
        db = SessionLocal()
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        token = issue_token(db, did, "legal", admin)
        db.commit(); db.close()

        assert client.post(f"/api/approval-action/{token}/approve", json={}).status_code == 200
        again = client.post(f"/api/approval-action/{token}/approve", json={})
        assert again.status_code == 410, "a used link must not work twice"

    def test_bogus_token_rejected(self, client):
        assert client.get("/api/approval-action/not-a-real-token").status_code == 404

    def test_expired_token_rejected(self, client, admin_headers):
        from datetime import datetime, timedelta, timezone
        from app.api.approval_action_api import issue_token
        from app.database import SessionLocal
        from app.models import ApprovalToken, User
        did = self._draft_awaiting_approval(client, admin_headers)
        db = SessionLocal()
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        token = issue_token(db, did, "legal", admin)
        row = db.query(ApprovalToken).filter(ApprovalToken.token == token).first()
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit(); db.close()
        assert client.get(f"/api/approval-action/{token}").status_code == 410
