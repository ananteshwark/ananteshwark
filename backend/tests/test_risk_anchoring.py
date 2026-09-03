"""Every risk the page lists should be highlighted in the document it came from.

The page located each flagged clause by exact substring search. Rule-based flags
are cut from the text verbatim so they matched; AI-suggested ones are quoted by a
model, which re-flows the whitespace, so they never matched and were listed
without a highlight — which reads as the analysis being wrong.
"""
from app.services.text_anchor import anchor_all, locate, merge_spans

DOC = """1. Services. The Vendor shall provide teleradiology services.

2. Indemnity. The Company shall indemnify and hold harmless the Vendor from any
and all claims arising out of this Agreement.

3. Termination. The Vendor may terminate this Agreement at any time for
convenience without notice.
"""


class TestLocating:
    def test_exact_quote(self):
        span = locate(DOC, "The Vendor may terminate this Agreement")
        assert span and DOC[span[0]:span[1]] == "The Vendor may terminate this Agreement"

    def test_quote_with_reflowed_whitespace(self):
        """What a model returns: the clause on one line, newlines gone. This is
        the case that silently produced no highlight."""
        span = locate(DOC, "The Company shall indemnify and hold harmless the Vendor "
                           "from any and all claims")
        assert span is not None
        assert "indemnify and hold harmless" in DOC[span[0]:span[1]]

    def test_quote_with_different_case_and_spacing(self):
        span = locate(DOC, "the   COMPANY shall indemnify")
        assert span and DOC[span[0]:span[1]].lower().startswith("the company shall indemnify")

    def test_elided_quote_anchors_to_its_longest_fragment(self):
        span = locate(DOC, "Company shall indemnify and hold harmless ... out of this Agreement")
        assert span is not None
        assert "indemnify and hold harmless" in DOC[span[0]:span[1]]

    def test_unrelated_text_is_not_forced_onto_a_clause(self):
        """A wrong highlight is worse than none: it points the reader at an
        innocent clause and labels it risky. Measured, an elided genuine quote
        scores ~65 against its own clause and unrelated contract language scores
        47-58, so the bar stays above both rather than splitting them."""
        assert locate(DOC, "The Vendor grants an exclusive licence to the Moon") is None
        assert locate(DOC, "Governing law shall be the laws of India, courts at Mumbai") is None

    def test_empty_inputs(self):
        assert locate("", "anything") is None
        assert locate(DOC, "") is None


class TestAnchoringASet:
    def test_unlocatable_items_are_reported_not_dropped(self):
        items = [{"text": "The Vendor may terminate this Agreement"},
                 {"text": "A clause that is simply not in this document at all"}]
        anchored, missing = anchor_all(DOC, items)
        assert len(anchored) == 2, "nothing may be silently discarded"
        assert missing == 1
        assert anchored[0]["start"] is not None and anchored[1]["start"] is None

    def test_overlapping_risks_both_survive(self):
        """Two risks over the same passage: the page used to skip the second."""
        items = [{"text": "The Company shall indemnify and hold harmless the Vendor"},
                 {"text": "hold harmless the Vendor from any and all claims"}]
        anchored, missing = anchor_all(DOC, items)
        assert missing == 0
        merged = merge_spans(anchored)
        assert len(merged) == 2, "an overlapping risk must still be shown"
        assert merged[0]["end"] <= merged[1]["start"], "segments must not overlap"


class TestEndpoint:
    def test_clause_risk_returns_spans(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="Anchor Co", contract_type="MSA",
                     status=ContractStatus.VALIDATED, extracted_text=DOC,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        out = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers).json()
        assert out["flagged"], "this document has clauses against the company"
        assert "unlocatable" in out
        for f in out["flagged"]:
            assert "start" in f and "end" in f
            if f["start"] is not None:
                assert out["text"][f["start"]:f["end"]], "a span must select real text"


class TestAnalysisIsCached:
    """Opening a contract used to cost a model call every time, for an answer
    that cannot change unless the document does."""

    def _seed(self, text=DOC):
        import uuid

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"Cache-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                     status=ContractStatus.VALIDATED, extracted_text=text,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_second_view_does_not_re_analyse(self, client, admin_headers, monkeypatch):
        sr = self._seed()
        calls = []
        from app.services import contract_risk
        real = contract_risk.analyze_contract_risk

        def counted(text, db=None):
            calls.append(1)
            return real(text, db=db)

        monkeypatch.setattr(contract_risk, "analyze_contract_risk", counted)

        first = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers).json()
        second = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers).json()
        assert first["cached"] is False and second["cached"] is True
        assert len(calls) == 1, f"analysis ran {len(calls)} times for two views"
        assert second["flagged"] == first["flagged"]

    def test_refresh_forces_a_fresh_pass(self, client, admin_headers):
        sr = self._seed()
        client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers)
        again = client.get(f"/api/contracts/{sr}/clause-risk?refresh=true", headers=admin_headers).json()
        assert again["cached"] is False

    def test_changed_document_invalidates_the_cache(self, client, admin_headers):
        """Nobody should have to remember to re-analyse after a re-extraction."""
        from app.database import SessionLocal
        from app.models import Contract
        sr = self._seed()
        client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers)

        db = SessionLocal()
        c = db.get(Contract, sr)
        c.extracted_text = DOC + "\n5. Liability. The Company shall be liable without limit."
        db.commit(); db.close()

        out = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers).json()
        assert out["cached"] is False, "a changed document must not serve a stale analysis"


class TestCachedAnalysisStoredAsText:
    """Same upgrade hazard as the sketch column: a database whose clause_risk
    column was created as TEXT returns a JSON string, and iterating it as a list
    of dicts fails — a 500 on opening any contract with a cached analysis."""

    def test_a_cached_analysis_stored_as_a_string_is_read_back(self, client, admin_headers):
        import hashlib
        import json
        import uuid

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"Txt-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                     status=ContractStatus.VALIDATED, extracted_text=DOC,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit()
        # Exactly what a TEXT column hands back.
        c.clause_risk = json.dumps([{"clause_type": "Indemnity", "reasons": ["one-sided"],
                                     "text": "x", "start": None, "end": None}])
        c.clause_risk_hash = hashlib.sha256(DOC.encode()).hexdigest()
        db.commit(); sr = c.sr_no; db.close()

        out = client.get(f"/api/contracts/{sr}/clause-risk", headers=admin_headers)
        assert out.status_code == 200, out.text
        body = out.json()
        assert body["cached"] is True
        assert body["flagged"][0]["clause_type"] == "Indemnity"
        assert body["unlocatable"] == 1
