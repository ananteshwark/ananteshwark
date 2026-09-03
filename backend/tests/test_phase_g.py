"""Phase G — retrieval that actually works, and answers you can check."""
import uuid

import pytest


def _seed(text, service="services", value=100000):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"G-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 contract_service=service, contract_value=value, currency="INR",
                 status=ContractStatus.VALIDATED, extracted_text=text,
                 raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


# --- G1: the measured failure that started Phase G -------------------------

PARAPHRASES = [
    ("the vendor shall indemnify the company", "the supplier will hold us harmless"),
    ("payment due within thirty days", "invoices payable in 30 days"),
    ("either party may terminate on 60 days notice",
     "this agreement may be cancelled with two months prior written notice"),
    ("total liability shall not exceed the fees paid",
     "aggregate liability is capped at amounts paid"),
]
UNRELATED = [
    ("teleradiology imaging interpretation services", "cafeteria catering and food services"),
    ("the vendor shall indemnify the company", "governing law is the laws of India"),
]


class TestG1Embeddings:
    def test_every_paraphrase_beats_every_unrelated_pair(self):
        """The regression that motivated Phase G: a true paraphrase scored BELOW
        unrelated text. This invariant must hold, not just improve."""
        from app.services.embeddings import cosine, embed_concept as E
        worst_para = min(cosine(E(a), E(b)) for a, b in PARAPHRASES)
        best_noise = max(cosine(E(a), E(b)) for a, b in UNRELATED)
        assert worst_para > best_noise, (
            f"weakest paraphrase {worst_para:.3f} must beat strongest noise {best_noise:.3f}")

    def test_concept_provider_beats_legacy_on_paraphrase(self):
        from app.services.embeddings import cosine, embed_concept as E, embed_hashing as H
        for a, b in PARAPHRASES:
            assert cosine(E(a), E(b)) > cosine(H(a), H(b)), f"no improvement on: {a}"

    def test_lexicon_collapses_synonyms(self):
        from app.services.legal_lexicon import concepts_in
        assert "indemnity" in concepts_in("the vendor shall indemnify")
        assert "indemnity" in concepts_in("supplier will hold harmless")
        assert "termination" in concepts_in("either party may terminate")
        assert concepts_in("the weather is pleasant today") == set()

    def test_lexicon_matches_inflected_forms(self):
        """The surface table lists citation forms, but contracts inflect freely.
        "who indemnifies whom" used to emit no concept at all and drop to lexical
        matching — a query written in the third person quietly lost recall."""
        from app.services.legal_lexicon import concepts_in
        for text, concept in [
            ("who indemnifies whom for third party claims", "indemnity"),
            ("the parties indemnified each other", "indemnity"),
            ("vendor terminates the agreement", "termination"),
            ("the company warrants the deliverables", "warranty"),
            ("data is processed confidentially", "confidentiality"),
            ("the supplier subcontracts the work", "subcontracting"),
            ("amounts are payable monthly", "payment"),
        ]:
            assert concept in concepts_in(text), f"{text!r} should yield {concept}"
        # Stems must not fire on ordinary prose.
        assert concepts_in("the quick brown fox jumps over the lazy dog") == set()

    def test_concept_signal_survives_a_long_document(self):
        """Concept tokens and character trigrams live in separate channels, so
        document length cannot dilute the semantic signal. Hashed into one bag,
        ~6 concept tokens lost to ~100 trigrams and unrelated text drew level."""
        from app.services.embeddings import cosine, embed_concept as E
        filler = ("The parties acknowledge the schedules attached hereto form part "
                  "of this agreement and the recitals are incorporated by reference. ") * 20
        query = "indemnity obligations"
        relevant = filler + "The Supplier shall hold the Customer harmless from all claims."
        unrelated = filler + "The Supplier provides cafeteria catering to staff on site."
        assert cosine(E(query), E(relevant)) > cosine(E(query), E(unrelated)) + 0.05

    def test_number_words_normalize(self):
        from app.services.legal_lexicon import normalize
        assert "30" in normalize("thirty days notice")

    def test_identical_text_still_scores_highest(self):
        from app.services.embeddings import cosine, embed_concept as E
        s = "the vendor shall indemnify the company against all claims"
        assert cosine(E(s), E(s)) > 0.99


class TestG1Versioning:
    def test_provider_change_marks_index_stale(self, client, admin_headers):
        sr = _seed("The Vendor shall indemnify the Company against all claims.")
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        assert client.get("/api/repo-ai/index-status", headers=admin_headers).json()["stale"] >= 0

        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"embedding_provider": "hashing"}})
        try:
            st = client.get("/api/repo-ai/index-status", headers=admin_headers).json()
            assert st["provider"] == "hashing"
            assert st["stale"] >= 1, "vectors from another space must count as stale"
        finally:
            client.put("/api/settings", headers=admin_headers,
                       json={"values": {"embedding_provider": "concept"}})

    def test_reindex_clears_stale(self, client, admin_headers):
        _seed("Confidential Information shall be kept secret by both parties.")
        for _ in range(6):
            out = client.post("/api/repo-ai/reindex?limit=200", headers=admin_headers).json()
            if out["remaining"] == 0:
                break
        assert client.get("/api/repo-ai/index-status", headers=admin_headers).json()["stale"] == 0


class TestG3Hybrid:
    def test_paraphrase_is_retrieved_and_outranks_unrelated(self, client, admin_headers):
        """A paraphrase must be retrievable and must beat unrelated text.

        It is NOT required to beat documents that literally contain the queried
        term — a doc saying "indemnify" legitimately outranks one saying "hold
        harmless" for the query "indemnity". The property that was broken before
        Phase G is that the paraphrase scored no better than noise.
        """
        marker = uuid.uuid4().hex[:6]
        target = _seed(f"Ref {marker}. The Supplier will hold the Customer harmless "
                       f"from all third party claims arising from the services.")
        decoy = _seed(f"Ref {marker}. The vendor provides cafeteria catering and "
                      f"on-site food services to staff.")
        for _ in range(8):
            if client.post("/api/repo-ai/reindex?limit=500", headers=admin_headers).json()["remaining"] == 0:
                break
        res = client.get("/api/repo-ai/search?q=indemnity obligations&limit=200",
                         headers=admin_headers).json()
        ids = [r["sr_no"] for r in res["results"]]
        assert target in ids, "the paraphrase must be retrievable at all"
        if decoy in ids:
            assert ids.index(target) < ids.index(decoy), \
                "paraphrase must rank above unrelated text"

    def test_exact_identifier_still_found(self, client, admin_headers):
        token = f"ZZTOKEN{uuid.uuid4().hex[:6].upper()}"
        sr = _seed(f"Reference number {token} applies to this statement of work.")
        for _ in range(6):
            if client.post("/api/repo-ai/reindex?limit=200", headers=admin_headers).json()["remaining"] == 0:
                break
        res = client.get(f"/api/repo-ai/search?q={token}", headers=admin_headers).json()
        hit = next((r for r in res["results"] if r["sr_no"] == sr), None)
        assert hit is not None and hit["keyword_hit"] is True

    def test_keyword_channel_is_ranked_by_relevance(self, client, admin_headers):
        """The keyword side of the fusion has to be an actual ranking. It used to
        be a set, which RRF then ordered by primary key — so the oldest contract
        matching any one term outranked a newer one matching all of them."""
        from app.api.repository_ai_api import _keyword_ids
        from app.database import SessionLocal
        a, b = uuid.uuid4().hex[:6].upper(), uuid.uuid4().hex[:6].upper()
        one_term = _seed(f"This schedule refers to {a} only.")           # older, 1 term
        both_terms = _seed(f"This schedule refers to {a} and to {b}.")   # newer, 2 terms
        db = SessionLocal()
        try:
            ranked = _keyword_ids(db, f"{a} {b}")
        finally:
            db.close()
        assert ranked.index(both_terms) < ranked.index(one_term)


class TestG4Citations:
    def test_fabricated_citation_is_caught(self):
        from app.services.citations import verify
        report = verify("The cap is twelve months of fees [#999].", {1: "Liability is capped."})
        assert report["verified"] is False
        assert report["problems"][0]["status"] == "fabricated"

    def test_unsupported_citation_is_caught(self):
        from app.services.citations import verify
        report = verify(
            "The agreement mandates biannual penetration testing of the payment gateway [#1].",
            {1: "The vendor provides cafeteria catering and food services on site."})
        assert report["verified"] is False
        assert report["problems"][0]["status"] == "unsupported"

    def test_supported_citation_passes(self):
        from app.services.citations import verify
        report = verify(
            "Liability is capped at twelve months of fees [#1].",
            {1: "The aggregate liability shall be capped at twelve months of fees paid."})
        assert report["verified"] is True
        assert report["citations"][0]["status"] == "ok"

    def test_annotation_marks_only_bad_citations(self):
        from app.services.citations import annotate, verify
        answer = "Good claim about catering [#1]. Invented claim [#42]."
        report = verify(answer, {1: "The vendor provides catering."})
        marked = annotate(answer, report)
        assert "[#42 ⚠ unverified]" in marked
        assert "[#1]" in marked

    def test_ask_reports_verification(self, client, admin_headers):
        _seed("The Vendor shall maintain 99.9% uptime availability.")
        r = client.post("/api/repo-ai/ask", headers=admin_headers,
                        json={"question": "what uptime is guaranteed?"}).json()
        assert "verified" in r


class TestG5ScopedQA:
    def test_ask_one_contract_offline_returns_passages(self, client, admin_headers):
        sr = _seed("1. Term. This agreement runs for three years.\n\n"
                   "2. Liability. The aggregate liability shall not exceed the fees paid "
                   "in the preceding twelve months under this agreement.")
        r = client.post(f"/api/repo-ai/contracts/{sr}/ask", headers=admin_headers,
                        json={"question": "what is the liability cap?"}).json()
        assert r["ai"] is False
        assert r["passages"], "offline mode should still surface relevant passages"
        assert "liability" in r["passages"][0]["text"].lower()

    def test_ask_unknown_contract_404s(self, client, admin_headers):
        assert client.post("/api/repo-ai/contracts/99999999/ask", headers=admin_headers,
                           json={"question": "x"}).status_code == 404

    def test_compare_builds_a_table(self, client, admin_headers):
        a = _seed("Liability is capped at twelve months of fees.", value=100000)
        b = _seed("The supplier accepts unlimited liability for data breaches.", value=250000)
        out = client.post("/api/repo-ai/compare", headers=admin_headers,
                          json={"sr_nos": [a, b], "attributes": ["counterparty", "value", "liability cap"]}).json()
        assert [c["key"] for c in out["columns"]] == ["counterparty", "value", "liability cap"]
        assert len(out["rows"]) == 2
        row_a = next(r for r in out["rows"] if r["sr_no"] == a)
        assert "100,000" in (row_a["cells"]["value"] or "")
        # the free-text attribute is located by concept, with no model configured
        assert "liability" in (row_a["cells"]["liability cap"] or "").lower()

    def test_compare_requires_contracts(self, client, admin_headers):
        assert client.post("/api/repo-ai/compare", headers=admin_headers,
                           json={"sr_nos": []}).status_code == 400


class TestG3IdentifierSurvivesACrowdedCorpus:
    def test_exact_reference_is_not_crowded_out(self, client, admin_headers):
        """Asking for a contract by reference must return it even when hundreds
        of contracts score better semantically.

        Reciprocal rank alone let the vector channel take every slot: a keyword
        hit at rank 1 scores (1-w)/(k+1) against w/(k+1) for a semantic
        near-miss, so the one contract containing the reference fell out of the
        result set entirely once the repository was large enough. It passed in a
        small corpus, which is exactly why it went unnoticed.
        """
        marker = f"ZANTHUM{uuid.uuid4().hex[:6].upper()}"
        target = _seed(f"Wayne Enterprises supplies {marker} integrated security "
                       f"systems with a 99.9% uptime SLA.")
        # Crowd the ranking with contracts that answer the *shape* of the query.
        for i in range(40):
            _seed(f"Contract {i}: which services this agreement covers is set out "
                  f"in the schedule, mentioning support, uptime and security.")
        for _ in range(10):
            if client.post("/api/repo-ai/reindex?limit=500",
                           headers=admin_headers).json()["remaining"] == 0:
                break

        r = client.post("/api/repo-ai/ask", headers=admin_headers,
                        json={"question": f"which contract mentions {marker}?"}).json()
        assert any(c["sr_no"] == target for c in r["citations"]), (
            "the contract that literally contains the reference must be cited")


class TestPgvectorMirrorIsContained:
    """The pgvector mirror is optional, so its failure must stay contained.

    On Postgres a failed statement aborts the entire transaction, so catching
    the exception did not contain it: on a database without the pgvector
    extension the mirror raised `type "vector" does not exist`, the except hid
    it, and every later statement in the request failed with
    InFailedSqlTransaction — a 500 on re-index and on generating any abstract.
    SQLite does not behave that way, which is why the whole suite stayed green.
    """

    class _FakeSession:
        """Minimal stand-in for a Postgres session whose vector write fails."""
        def __init__(self):
            self.executed = 0
            self.savepoints = 0
            self.rolled_back = 0
            outer = self

            class _Dialect:
                name = "postgresql"

            class _Bind:
                dialect = _Dialect()

            class _Nested:
                def __enter__(self):
                    outer.savepoints += 1
                    return self

                def __exit__(self, exc_type, exc, tb):
                    if exc_type is not None:
                        outer.rolled_back += 1
                    return False        # re-raise, as a real savepoint does

            self.bind = _Bind()
            self._nested = _Nested

        def begin_nested(self):
            return self._nested()

        def execute(self, *a, **kw):
            self.executed += 1
            raise RuntimeError('type "vector" does not exist')

    def _reset(self):
        from app.services import contract_ai
        contract_ai._PGVECTOR_AVAILABLE = None

    def test_failure_is_rolled_back_not_swallowed(self):
        from app.services import contract_ai
        self._reset()
        db = self._FakeSession()
        contract = type("C", (), {"sr_no": 1})()

        contract_ai._sync_pgvector(db, contract, [0.1] * 256)  # must not raise

        assert db.savepoints == 1, "the mirror write must run inside a nested transaction"
        assert db.rolled_back == 1, "the failure must roll back to the savepoint"

    def test_an_unavailable_column_is_only_attempted_once(self):
        """A repository-wide re-index must not attempt thousands of doomed writes."""
        from app.services import contract_ai
        self._reset()
        db = self._FakeSession()
        contract = type("C", (), {"sr_no": 1})()
        for _ in range(5):
            contract_ai._sync_pgvector(db, contract, [0.1] * 256)
        assert db.executed == 1, f"expected one attempt, made {db.executed}"
        self._reset()

    def test_sqlite_is_skipped_without_touching_the_session(self):
        from app.database import SessionLocal
        from app.services.contract_ai import _sync_pgvector
        self._reset()
        db = SessionLocal()
        try:
            _sync_pgvector(db, type("C", (), {"sr_no": 1})(), [0.1] * 256)
        finally:
            db.close()
        self._reset()
