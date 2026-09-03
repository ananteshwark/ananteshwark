"""Duplicate detection over the document, not only over the captured fields.

The record-level check compares vendor, PO, dates and service. It finds nothing
when the same paper is ingested twice before anyone has captured anything from
it, or when a field was mis-keyed — which is when a duplicate is cheapest to
catch.
"""
import uuid

from app.services.document_dupes import (
    SIMILARITY_THRESHOLD,
    find_content_duplicates,
    similarity,
    sketch,
)

BASE = """MASTER SERVICES AGREEMENT
This Agreement is made between IKS Health Solutions Private Limited (the Company) and
Acme Radiology LLP (the Vendor), with effect from 1 April 2026 and expiring on 31 March 2027.
1. Services. The Vendor shall provide teleradiology reporting services to the Company
in accordance with the service levels set out in Schedule A.
2. Fees. Fees of INR 24,50,000 are payable Net 45 days from the date of invoice.
3. Indemnity. The Vendor shall indemnify the Company against all third party claims.
4. Termination. Either party may terminate on 60 days written notice.
5. Governing law. This Agreement is governed by the laws of India.
"""
REFORMATTED = "IKS HEALTH — CONFIDENTIAL\nPage 1 of 3\n" + BASE + "\nPage 3 of 3\n"
CLAUSE_DROPPED = BASE.replace("5. Governing law. This Agreement is governed by the laws of India.\n", "")
RENEWAL = (BASE.replace("1 April 2026", "1 April 2027").replace("31 March 2027", "31 March 2028")
               .replace("24,50,000", "26,00,000"))
TEMPLATE_SIBLING = (BASE.replace("teleradiology reporting", "medical coding and billing")
                        .replace("Acme Radiology LLP", "Zenith Coding Pvt Ltd")
                        .replace("Schedule A", "Schedule B"))
UNRELATED = """SOFTWARE LICENCE AGREEMENT
The Licensor grants the Licensee a non-exclusive licence to use the software.
Support is provided during business hours. Fees are payable annually in advance.
"""


class TestWhatCountsAsTheSamePaper:
    def test_the_same_document_reformatted_is_caught(self):
        """The real case: re-ingested from another folder, or re-extracted, so
        the bytes differ and the ingestion-time hash check does not fire."""
        assert similarity(sketch(BASE), sketch(REFORMATTED)) >= SIMILARITY_THRESHOLD
        assert similarity(sketch(BASE), sketch(CLAUSE_DROPPED)) >= SIMILARITY_THRESHOLD

    def test_a_renewal_is_not_called_a_duplicate(self):
        """Next year's paper is nearly the same words and is not the same
        contract. Flagging it would train people to dismiss the prompt."""
        assert similarity(sketch(BASE), sketch(RENEWAL)) < SIMILARITY_THRESHOLD

    def test_a_sibling_on_the_same_template_is_not_a_duplicate(self):
        assert similarity(sketch(BASE), sketch(TEMPLATE_SIBLING)) < SIMILARITY_THRESHOLD

    def test_unrelated_paper_scores_nothing(self):
        assert similarity(sketch(BASE), sketch(UNRELATED)) < 0.1

    def test_ocr_noise_is_a_known_limitation(self):
        """Documented rather than hidden: corrupting words breaks every shingle
        across them, and no shingle length separated a noisy re-scan from a
        renewal. Those are left to the record-level check."""
        import random
        random.seed(7)
        noisy = "".join(random.choice("aeiornlst") if c.isalpha() and random.random() < 0.03 else c
                        for c in BASE)
        assert similarity(sketch(BASE), sketch(noisy)) < SIMILARITY_THRESHOLD

    def test_short_text_yields_no_sketch(self):
        assert sketch("too short") == []
        assert similarity([], sketch(BASE)) == 0.0


class TestFinding:
    def test_picks_out_the_matching_document(self):
        hits = find_content_duplicates(
            sketch(BASE),
            [(1, sketch(UNRELATED)), (2, sketch(REFORMATTED)), (3, sketch(RENEWAL))],
        )
        assert [sr for sr, _ in hits] == [2]


class TestValidationFlagsIt:
    def _seed(self, client, headers, text, status):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"DC-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                     status=ContractStatus[status], extracted_text=text,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_same_document_is_flagged_even_with_nothing_captured(self, client, admin_headers):
        """Different vendor names and no PO on either side, so the record-level
        check has nothing to compare — the documents are the same paper."""
        original = self._seed(client, admin_headers, BASE, "VALIDATED")
        incoming = self._seed(client, admin_headers, REFORMATTED, "PENDING_VALIDATION")

        from app.api.contracts_api import _content_duplicate_hits
        from app.database import SessionLocal
        from app.models import Contract
        db = SessionLocal()
        try:
            # The stored contract needs its sketch before it can be compared against.
            from app.api.contracts_api import _content_sketch
            _content_sketch(db, db.get(Contract, original))
            db.commit()
            hits = _content_duplicate_hits(db, db.get(Contract, incoming))
        finally:
            db.close()
        assert original in hits, "the same document should be flagged"
        assert hits[original] >= SIMILARITY_THRESHOLD


class TestColumnsCreatedAsText:
    """A database upgraded by the first version of this migration has these
    columns as TEXT, not JSON. Postgres then returns a *string* where a value
    computed in the same process is a list, and comparing the two raised
    TypeError from inside the validate endpoint — a 500 on Save & Validate.
    Invisible on SQLite, where JSON is TEXT and the round-trip is identical.
    """

    def test_a_sketch_stored_as_a_json_string_still_compares(self):
        import json
        mine = sketch(BASE)
        as_text = json.dumps(sketch(REFORMATTED))          # what the TEXT column returns
        assert isinstance(as_text, str)
        assert similarity(mine, as_text) >= SIMILARITY_THRESHOLD

    def test_find_handles_string_sketches(self):
        import json
        hits = find_content_duplicates(
            sketch(BASE),
            [(1, json.dumps(sketch(UNRELATED))), (2, json.dumps(sketch(REFORMATTED)))],
        )
        assert [sr for sr, _ in hits] == [2]

    def test_unparseable_content_is_ignored_not_raised(self):
        assert similarity(sketch(BASE), "not json at all") == 0.0
        assert similarity(sketch(BASE), None) == 0.0

    def test_the_migration_declares_these_columns_as_json(self):
        """The DDL was TEXT while the model said JSON, which is what created the
        mismatch. Every other JSON column in this table is declared JSON."""
        from app.migrations import _ADD_COLUMNS
        ddl = {(t, c): d for t, c, d in _ADD_COLUMNS}
        assert ddl[("contracts", "content_sketch")] == "JSON"
        assert ddl[("contracts", "clause_risk")] == "JSON"


class TestBackfill:
    def test_contracts_validated_earlier_become_comparable(self, client, admin_headers):
        """Without this the check finds nothing on an existing repository: every
        contract predating the feature has no sketch, so there is nothing to
        compare a new one against."""
        import uuid

        from app.api.contracts_api import _content_duplicate_hits
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        old = Contract(vendor_name_raw=f"Old-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                       status=ContractStatus.VALIDATED, extracted_text=BASE,
                       raw_extracted={}, confidence={})
        incoming = Contract(vendor_name_raw=f"New-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                            status=ContractStatus.PENDING_VALIDATION, extracted_text=REFORMATTED,
                            raw_extracted={}, confidence={})
        db.add_all([old, incoming]); db.commit()
        old_sr, new_sr = old.sr_no, incoming.sr_no
        assert db.get(Contract, old_sr).content_sketch is None, "precondition: no sketch yet"

        hits = _content_duplicate_hits(db, db.get(Contract, new_sr))
        db.commit()
        try:
            assert old_sr in hits, "an existing contract must be backfilled and compared"
            assert db.get(Contract, old_sr).content_sketch, "its sketch should now be stored"
        finally:
            db.close()
