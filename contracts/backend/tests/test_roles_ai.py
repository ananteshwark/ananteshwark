"""Expanded authoring roles (Author/Legal/Approver) + AI-configured features."""
import uuid


def _mk_user(client, admin_headers, role):
    email = f"{role.lower()}-{uuid.uuid4().hex[:6]}@example.com"
    client.post("/api/auth/users", headers=admin_headers,
                json={"email": email, "name": role, "password": "password123", "role": role})
    tok = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


class TestRoles:
    def test_new_roles_can_be_created_and_login(self, client, admin_headers):
        for role in ("AUTHOR", "LEGAL", "APPROVER"):
            h = _mk_user(client, admin_headers, role)
            me = client.get("/api/auth/me", headers=h).json()
            assert me["role"] == role

    def test_author_can_draft_but_not_validate_register(self, client, admin_headers):
        author = _mk_user(client, admin_headers, "AUTHOR")
        # Author can create + edit an authoring draft
        d = client.post("/api/authoring/drafts", headers=author,
                        json={"origin": "scratch", "contract_type": "MSA"})
        assert d.status_code == 200, d.text
        did = d.json()["id"]
        assert client.put(f"/api/authoring/drafts/{did}", headers=author,
                          json={"fields": {"vendor": "Acme"}}).status_code == 200
        # …but cannot create a register contract (validator-only)
        assert client.post("/api/contracts", headers=author,
                           json={"signing_entity": "X"}).status_code == 403

    def test_only_legal_can_approve_clause_and_edit_legal_approved(self, client, admin_headers):
        author = _mk_user(client, admin_headers, "AUTHOR")
        legal = _mk_user(client, admin_headers, "LEGAL")
        v = client.post("/api/clauses/versions", headers=author, json={
            "clause_type": f"Role-{uuid.uuid4().hex[:5]}", "text": "Clause body for role test one two."}).json()
        # Author cannot approve a clause
        assert client.post(f"/api/clauses/versions/{v['id']}/approve", headers=author).status_code == 403
        # Legal can
        assert client.post(f"/api/clauses/versions/{v['id']}/approve", headers=legal).status_code == 200
        # Now legal-approved: Author may no longer edit it, Legal may
        assert client.put(f"/api/clauses/versions/{v['id']}", headers=author,
                          json={"text": "changed"}).status_code == 403
        assert client.put(f"/api/clauses/versions/{v['id']}", headers=legal,
                          json={"summary": "legal edit"}).status_code == 200

    def test_approval_gate_role_enforced(self, client, admin_headers):
        author = _mk_user(client, admin_headers, "AUTHOR")
        approver = _mk_user(client, admin_headers, "APPROVER")
        legal = _mk_user(client, admin_headers, "LEGAL")
        d = client.post("/api/authoring/drafts", headers=author,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        appr = client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=finance",
                           headers=author).json()
        # Legal cannot decide a finance gate; Approver can
        assert client.post(f"/api/esign/approvals/{appr['approval_id']}/decide", headers=legal,
                           json={"status": "APPROVED"}).status_code == 403
        assert client.post(f"/api/esign/approvals/{appr['approval_id']}/decide", headers=approver,
                           json={"status": "APPROVED"}).status_code == 200


class TestAiFallback:
    def test_ai_status_reports_configured_model(self, client, admin_headers):
        r = client.get("/api/clauses/ai-status", headers=admin_headers).json()
        assert "enabled" in r and "provider" in r and "model" in r

    def test_gap_analysis_works_without_ai_key(self, client, admin_headers):
        # No provider key configured in the test DB -> AI unavailable -> fallback
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "NDA"}).json()
        review = client.post(f"/api/authoring/drafts/{d['id']}/review", headers=admin_headers).json()
        assert "score" in review and review["ai"] is False

    def test_clause_summary_deterministic_fallback(self, client, admin_headers):
        v = client.post("/api/clauses/versions", headers=admin_headers, json={
            "clause_type": f"Sum-{uuid.uuid4().hex[:5]}",
            "text": "The liability of each party shall not exceed twelve months of fees."}).json()
        s = client.post(f"/api/clauses/versions/{v['id']}/summarize", headers=admin_headers).json()
        assert s["summary"] and "cap" in s["summary"].lower()
