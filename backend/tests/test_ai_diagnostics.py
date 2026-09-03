"""Why the configured AI provider is not working.

Every AI feature falls back silently when the provider fails, which is right
for the feature and leaves an administrator with nothing to act on. These cover
the parts that turn "it's not working" into a specific cause.
"""
from app.services.ai_diagnostics import hint_for, probe_provider


class TestHints:
    def test_rejected_key(self):
        assert "key was rejected" in hint_for("400 API key not valid. Please pass a valid API key.")

    def test_withdrawn_model(self):
        hint = hint_for("404 models/gemini-1.5-pro is not found for API version v1beta")
        assert "Retired models" in hint

    def test_quota(self):
        assert "quota" in hint_for("429 Resource has been exhausted (e.g. check quota).")

    def test_api_not_enabled(self):
        assert "Generative Language API" in hint_for(
            "403 Generative Language API has not been used in project 123 before or it is disabled")

    def test_isolated_network(self):
        assert "isolated network" in hint_for(
            "HTTPSConnectionPool: Failed to resolve 'generativelanguage.googleapis.com'")

    def test_missing_package(self):
        assert "not installed" in hint_for("No module named 'google.generativeai'")

    def test_unfamiliar_error_gets_no_invented_advice(self):
        assert hint_for("something entirely unexpected happened") is None


class TestProviderTest:
    def test_reports_missing_key_without_calling_out(self, client, admin_headers):
        client.put("/api/settings", headers=admin_headers, json={"values": {
            "extraction_provider": "gemini", "gemini_api_key": "", "gemini_model": "gemini-2.5-pro"}})
        r = client.post("/api/settings/ai-test", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is False
        assert body["provider"] == "gemini" and body["model"] == "gemini-2.5-pro"
        assert body["key_configured"] is False
        assert "No API key" in body["error"]

    def test_a_failing_provider_is_a_result_not_a_500(self, client, admin_headers):
        """The whole point is handing back the provider's own message, so the
        endpoint must not turn a failed call into a server error."""
        client.put("/api/settings", headers=admin_headers, json={"values": {
            "extraction_provider": "gemini", "gemini_api_key": "not-a-real-key",
            "gemini_model": "gemini-2.5-pro", "clause_ai_enabled": "true"}})
        r = client.post("/api/settings/ai-test", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is False
        assert r.json()["error"]

    def test_only_admins_can_probe(self, client, admin_headers):
        client.post("/api/auth/users", headers=admin_headers, json={
            "email": "viewer-ai@example.com", "name": "V", "password": "password123",
            "roles": ["VIEWER"]})
        tok = client.post("/api/auth/login", json={
            "email": "viewer-ai@example.com", "password": "password123"}).json()["token"]
        r = client.post("/api/settings/ai-test", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 403

    def test_probe_never_raises(self, client):
        """probe_provider is called from a request handler and must always return
        a result, whatever the settings say."""
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            out = probe_provider(db)
            assert set(out) >= {"provider", "model", "ok", "error", "hint"}
        finally:
            db.close()


class TestFallbackReasonIsRecorded:
    def test_summary_records_why_the_model_was_not_used(self, client, admin_headers):
        """`ai_used=False` on its own reads the same whether AI is off by choice
        or the provider has been rejecting every call for a week."""
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus

        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"clause_ai_enabled": "false"}})
        db = SessionLocal()
        c = Contract(vendor_name_raw="Globex", contract_type="MSA",
                     status=ContractStatus.VALIDATED, extracted_text="A contract.",
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        assert client.post(f"/api/repo-ai/contracts/{sr}/summarize",
                           headers=admin_headers).status_code == 200
        runs = client.get("/api/ai/runs?feature=summary", headers=admin_headers).json()["runs"]
        mine = next(r for r in runs if r["entity_id"] == sr)
        assert mine["ai_used"] is False
        assert mine["error"] and "switched off" in mine["error"]
