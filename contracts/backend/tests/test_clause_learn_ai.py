"""AI-driven clause-learning batch job (with deterministic fallback)."""
import uuid


def _seed(text, ctype="MSA"):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"AILearn-{uuid.uuid4().hex[:6]}", contract_type=ctype,
                 status=ContractStatus.VALIDATED, extracted_text=text, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestAiSegmentation:
    def test_ai_segmentation_used_when_available(self, client, admin_headers, monkeypatch):
        from app.services import clauses as C
        # Force AI "available" and stub the model to return structured clauses.
        monkeypatch.setattr(C, "taxonomy", lambda db: ["Indemnity", "Payment Terms", "Confidentiality"])
        import app.services.ai_client as AC
        monkeypatch.setattr(AC, "ai_enabled", lambda db: True)

        def fake_llm_json(db, prompt, system=None, max_tokens=2000):
            return [
                {"clause_type": "Indemnity", "text": "The Vendor shall indemnify the Company against all claims of any kind."},
                {"clause_type": "Payment Terms", "text": "The Company shall pay each valid invoice within Net 30 days of receipt."},
                {"clause_type": "NotInTaxonomy", "text": "junk should be dropped"},
            ]
        monkeypatch.setattr(AC, "llm_json", fake_llm_json)

        sr = _seed("Some contract text that the model will segment into clauses.")
        r = client.post("/api/clauses/learn?reset=true&use_ai=true", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ai"] is True
        assert body["ai_used"] >= 1
        # the two valid clause types were learned; the out-of-taxonomy one dropped
        found = {v["clause_type"] for v in client.get("/api/clauses?clause_type=Indemnity", headers=admin_headers).json()}
        assert "Indemnity" in found

    def test_falls_back_to_deterministic_without_ai(self, client, admin_headers):
        _seed("1. Confidentiality. Each party shall keep all Confidential Information secret and proprietary.\n\n"
              "2. Payment Terms. The Company shall pay each invoice within Net 45 days of receipt.")
        # No AI key in the test env -> use_ai requested but falls back
        r = client.post("/api/clauses/learn?reset=true&use_ai=true", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["ai_used"] == 0          # nothing actually used AI
        assert body["clauses"] >= 2          # deterministic engine still learned clauses
