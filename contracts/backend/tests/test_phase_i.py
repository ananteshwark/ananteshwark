"""Phase I — AI you can audit, evaluate and roll back."""
import uuid

import pytest


def _seed(text="The Company shall pay each invoice within Net 45 days."):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"I-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, extracted_text=text,
                 raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestI1Audit:
    def test_summary_generation_is_recorded(self, client, admin_headers):
        sr = _seed()
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        runs = client.get("/api/ai/runs?feature=summary&limit=50", headers=admin_headers).json()["runs"]
        mine = [r for r in runs if r["entity_id"] == sr]
        assert mine, "generating an abstract must leave an audit record"
        r = mine[0]
        assert r["feature"] == "summary"
        assert r["ai_used"] is False, "no model configured in tests — the fallback is recorded as such"
        assert r["output"], "the produced text is retained"
        assert r["latency_ms"] is not None

    def test_obligation_extraction_is_recorded(self, client, admin_headers):
        sr = _seed("The Vendor shall submit a monthly SLA report to the Company.")
        client.post(f"/api/contracts/{sr}/obligations/extract", headers=admin_headers)
        runs = client.get("/api/ai/runs?feature=obligations&limit=50", headers=admin_headers).json()["runs"]
        assert any(r["entity_id"] == sr for r in runs)

    def test_human_verdict_is_captured(self, client, admin_headers):
        sr = _seed()
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        runs = client.get("/api/ai/runs?feature=summary&limit=50", headers=admin_headers).json()["runs"]
        run_id = next(r["id"] for r in runs if r["entity_id"] == sr)

        out = client.post(f"/api/ai/runs/{run_id}/outcome", headers=admin_headers,
                          json={"outcome": "accepted", "note": "reads correctly"}).json()
        assert out["outcome"] == "accepted" and out["outcome_at"]

    def test_invalid_outcome_rejected(self, client, admin_headers):
        sr = _seed()
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        runs = client.get("/api/ai/runs?feature=summary&limit=50", headers=admin_headers).json()["runs"]
        run_id = next(r["id"] for r in runs if r["entity_id"] == sr)
        assert client.post(f"/api/ai/runs/{run_id}/outcome", headers=admin_headers,
                           json={"outcome": "vibes"}).status_code == 400

    def test_unjudged_filter(self, client, admin_headers):
        sr = _seed()
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        runs = client.get("/api/ai/runs?unjudged=true&limit=100", headers=admin_headers).json()["runs"]
        assert all(r["outcome"] is None for r in runs)

    def test_stats_reports_acceptance(self, client, admin_headers):
        sr = _seed()
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        runs = client.get("/api/ai/runs?feature=summary&limit=50", headers=admin_headers).json()["runs"]
        client.post(f"/api/ai/runs/{next(r['id'] for r in runs if r['entity_id'] == sr)}/outcome",
                    headers=admin_headers, json={"outcome": "accepted"})
        s = client.get("/api/ai/stats", headers=admin_headers).json()
        assert s["total_runs"] >= 1 and s["judged"] >= 1
        assert any(f["feature"] == "summary" for f in s["by_feature"])


class TestI2Evals:
    def test_all_suites_pass_on_the_current_build(self, client, admin_headers):
        out = client.post("/api/ai/evals/run", headers=admin_headers).json()
        assert out["ok"] is True, f"eval regressions: {out['suites']}"
        assert out["total"] >= 20

    def test_retrieval_suite_guards_the_original_defect(self, client, admin_headers):
        out = client.post("/api/ai/evals/run?suites=retrieval", headers=admin_headers).json()
        suite = out["suites"][0]
        assert suite["name"] == "retrieval"
        assert suite["failed"] == 0, suite["failures"]

    def test_evals_catch_a_regression(self, client, admin_headers):
        """Switching back to the legacy embedding must fail the retrieval suite —
        proof the harness would actually catch this class of regression."""
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"embedding_provider": "hashing"}})
        try:
            out = client.post("/api/ai/evals/run?suites=retrieval", headers=admin_headers).json()
            assert out["ok"] is False, "the legacy embedding should fail the golden set"
        finally:
            client.put("/api/settings", headers=admin_headers,
                       json={"values": {"embedding_provider": "concept"}})

    def test_named_suite_selection(self, client, admin_headers):
        out = client.post("/api/ai/evals/run?suites=citations,concepts",
                          headers=admin_headers).json()
        assert {s["name"] for s in out["suites"]} == {"citations", "concepts"}


class TestI3Registry:
    def test_registry_lists_features(self, client, admin_headers):
        feats = client.get("/api/ai/registry", headers=admin_headers).json()["features"]
        names = {f["feature"] for f in feats}
        assert {"summary", "obligations", "ask"} <= names
        for f in feats:
            assert f["version"] and f["prompt"]

    def test_prompt_override_is_reflected(self, client, admin_headers):
        from app.database import SessionLocal
        from app.services.settings_store import set_setting
        db = SessionLocal()
        set_setting(db, "prompt_summary", "CUSTOM PROMPT {body}")
        db.commit(); db.close()
        try:
            feats = client.get("/api/ai/registry", headers=admin_headers).json()["features"]
            summary = next(f for f in feats if f["feature"] == "summary")
            assert summary["customized"] is True
            assert "CUSTOM PROMPT" in summary["prompt"]
            assert "+custom" in summary["version"]
        finally:
            db = SessionLocal(); set_setting(db, "prompt_summary", ""); db.commit(); db.close()

    def test_render_tolerates_a_bad_placeholder(self):
        from app.database import SessionLocal
        from app.services.prompt_registry import render
        db = SessionLocal()
        try:
            version, text = render(db, "summary", {"facts": "x"})  # `body` missing
            assert version and isinstance(text, str)
        finally:
            db.close()

    def test_registry_is_admin_only(self, client):
        assert client.get("/api/ai/registry").status_code in (401, 403)


class TestI4Abstention:
    def test_abstains_when_retrieval_is_weak(self, client, admin_headers):
        r = client.post("/api/repo-ai/ask", headers=admin_headers, json={
            "question": "zzqx unrelated gibberish nothing matches this at all wxyz"}).json()
        # Either nothing was retrieved, or it abstained — never a confident answer.
        assert r.get("abstained") or not r["citations"]

    def test_answers_when_retrieval_is_strong(self, client, admin_headers):
        marker = f"QTOKEN{uuid.uuid4().hex[:6].upper()}"
        sr = _seed(f"The {marker} maintenance agreement provides 24x7 support coverage.")
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        r = client.post("/api/repo-ai/ask", headers=admin_headers,
                        json={"question": f"tell me about {marker} support coverage"}).json()
        assert not r.get("abstained"), "a strong match should not abstain"
        assert any(c["sr_no"] == sr for c in r["citations"])

    def test_should_abstain_helper(self):
        from app.services.ai_audit import should_abstain
        assert should_abstain([]) is True
        assert should_abstain([0.01, 0.05]) is True
        # A bare score with no question to judge it by has to clear the
        # off-domain floor on its own.
        assert should_abstain([0.5]) is True
        assert should_abstain([0.62]) is False

    def test_a_domain_question_is_answered_on_a_moderate_match(self):
        """Scores alone cannot separate off-domain questions from real ones —
        measured on a 482-contract corpus the ranges overlap (off-domain reached
        0.467, genuine ran down to 0.247). Whether the question speaks the
        domain's language does separate them."""
        from app.services.ai_audit import should_abstain
        assert should_abstain([0.44], query="what insurance must the vendor maintain") is False
        assert should_abstain([0.467], query="the airline industry earnings in brazil") is True

    def test_an_identifier_lookup_answers_whatever_the_score(self):
        """Asking for one contract by reference is a lookup, not a semantic
        search — there is no reason for it to score well, and a low score is not
        a reason to withhold the contract that was named."""
        from app.services.ai_audit import should_abstain
        assert should_abstain([0.08], query="tell me about ZZ4192", keyword_hit=True) is False

    def test_nothing_answers_below_the_absolute_floor(self):
        from app.services.ai_audit import should_abstain
        assert should_abstain([0.29], query="what is the liability cap") is True


class TestAuditDurability:
    """An audit row should outlive the transaction it was auditing — the runs
    most worth recording are the ones whose request then fails.

    Only achievable where the database permits a second concurrent writer.
    SQLite does not: a side connection writing under the request's open write
    transaction waits out the busy timeout (measured 5s a call), so there the
    row deliberately shares the caller's transaction. These run on Postgres.
    """

    @pytest.fixture(autouse=True)
    def _needs_concurrent_writer(self):
        from app.database import engine
        if engine.dialect.name == "sqlite":
            pytest.skip("SQLite allows one writer; audit rows share the caller's "
                        "transaction there by design")

    def test_run_survives_a_rollback(self):
        from app.database import SessionLocal
        from app.models import AiRun
        from app.services.ai_audit import record

        db = SessionLocal()
        try:
            with record(db, "durability-probe", entity_type="contract", entity_id=1) as run:
                run["output"] = "partial work"
                run["ai_used"] = True
            run_id = run.get("id")
            assert run_id is not None, "the run must be recorded"
            db.rollback()          # the feature's own work is discarded
        finally:
            db.close()

        other = SessionLocal()
        try:
            saved = other.get(AiRun, run_id)
            assert saved is not None, "the audit row was rolled back with the caller"
            assert saved.output == "partial work"
        finally:
            other.close()

    def test_a_failing_call_is_still_recorded(self):
        from app.database import SessionLocal
        from app.models import AiRun
        from app.services.ai_audit import record

        db = SessionLocal()
        try:
            with pytest.raises(RuntimeError):
                with record(db, "durability-raise") as run:
                    run["ai_used"] = True
                    raise RuntimeError("provider exploded")
            db.rollback()
        finally:
            db.close()

        other = SessionLocal()
        try:
            assert other.query(AiRun).filter(AiRun.feature == "durability-raise").all(), \
                "a failed AI call must leave an audit trail"
        finally:
            other.close()


class TestAuditAlwaysRecords:
    """Whatever the database, the run is recorded and its id handed back."""

    def test_record_returns_an_id_and_persists(self):
        from app.database import SessionLocal
        from app.models import AiRun
        from app.services.ai_audit import record

        db = SessionLocal()
        try:
            with record(db, "always-records", entity_type="contract") as run:
                run["output"] = "something"
            assert run.get("id") is not None
            db.commit()
            assert db.get(AiRun, run["id"]).feature == "always-records"
        finally:
            db.close()

    def test_recording_is_not_slow(self):
        """The independent-write attempt must never stall the request. Under
        SQLite it once waited out a 5s lock timeout on every call."""
        import time

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        from app.services.ai_audit import record

        db = SessionLocal()
        try:
            # A request handler normally has uncommitted work in flight.
            db.add(Contract(vendor_name_raw=f"T-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                            status=ContractStatus.VALIDATED, raw_extracted={},
                            confidence={}, extracted_text="x"))
            db.flush()
            started = time.perf_counter()
            with record(db, "speed-probe") as run:
                run["ai_used"] = False
            elapsed = time.perf_counter() - started
            assert elapsed < 1.0, f"audit write blocked for {elapsed:.1f}s"
        finally:
            db.rollback()
            db.close()
