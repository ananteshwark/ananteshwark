"""Field suggestions read from the document, not only from vendor history.

History knows what a vendor usually agrees; it says nothing about the paper on
screen, so the validator still had to find the PO number, the dates and the
payment terms by reading it.
"""
import uuid

from app.services.document_suggestions import suggest_from_document

DOC = """MASTER SERVICES AGREEMENT

This Agreement is made between IKS Health Solutions Private Limited (the Company)
and Acme Radiology LLP (the Vendor), with effect from 1 April 2026 and expiring on
31 March 2027. Purchase Order No. PO-2026-4471 applies to this engagement.

Fees of INR 24,50,000 are payable Net 45 days from the date of invoice.
Either party may terminate this Agreement on 60 days written notice.
"""


def _by_field(items):
    return {s["field"]: s for s in items}


class TestReadingTheDocument:
    def test_reads_the_terms_a_validator_would_hunt_for(self):
        got = _by_field(suggest_from_document(DOC, signing_entities=["IKS Health Solutions Private Limited"]))
        assert got["po_number"]["suggested"] == "PO-2026-4471"
        assert got["start_date"]["suggested"] == "2026-04-01"
        assert got["end_date"]["suggested"] == "2027-03-31"
        assert got["contract_value"]["suggested"] == 2450000.0
        assert got["currency"]["suggested"] == "INR"
        assert got["contract_type"]["suggested"] == "MSA"
        assert got["payment_term"]["suggested"] == "Net 45 days"
        assert got["notice_period"]["suggested"] == "60 days"

    def test_every_suggestion_quotes_the_document(self):
        """A validator checks a quote; a bare value asks to be trusted."""
        for s in suggest_from_document(DOC, signing_entities=["IKS Health Solutions Private Limited"]):
            assert s["evidence"].strip(), f"{s['field']} has no supporting quote"
            assert s["source"] == "document"

    def test_signing_entity_is_chosen_from_the_configured_list(self):
        """Matching known entities keeps this to a value the register accepts,
        rather than guessing a party name out of the text."""
        got = _by_field(suggest_from_document(DOC, signing_entities=["IKS Health Solutions Private Limited"]))
        assert got["signing_entity"]["suggested"] == "IKS Health Solutions Private Limited"
        # An entity that is not on the paper must not be suggested.
        other = _by_field(suggest_from_document(DOC, signing_entities=["Somebody Else Ltd"]))
        assert "signing_entity" not in other

    def test_end_date_before_start_is_not_offered(self):
        text = "Effective date 1 April 2026. This refers to an earlier expiry on 1 January 2020."
        got = _by_field(suggest_from_document(text))
        assert "end_date" not in got or got["end_date"]["suggested"] > got["start_date"]["suggested"]

    def test_prose_without_terms_suggests_nothing(self):
        assert suggest_from_document("The weather in the valley is pleasant this time of year.") == []
        assert suggest_from_document("") == []


class TestEndpoint:
    def test_validation_screen_gets_both_sources(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        ent = f"Ent {uuid.uuid4().hex[:5]} Limited"
        client.post("/api/internal-entities", headers=admin_headers, json={"name": ent})
        db = SessionLocal()
        c = Contract(vendor_name_raw="Acme Radiology LLP", contract_type="MSA",
                     status=ContractStatus.PENDING_VALIDATION,
                     extracted_text=DOC.replace("IKS Health Solutions Private Limited", ent),
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        out = client.get(f"/api/contracts/{sr}/field-suggestions", headers=admin_headers).json()
        assert "suggestions" in out and "document_suggestions" in out
        fields = {s["field"] for s in out["document_suggestions"]}
        assert {"po_number", "start_date", "end_date"} <= fields
        assert next(s for s in out["document_suggestions"] if s["field"] == "signing_entity")["suggested"] == ent

    def test_a_value_already_recorded_is_not_re_suggested(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="Acme", contract_type="MSA", po_number="PO-2026-4471",
                     status=ContractStatus.PENDING_VALIDATION, extracted_text=DOC,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        out = client.get(f"/api/contracts/{sr}/field-suggestions", headers=admin_headers).json()
        assert "po_number" not in {s["field"] for s in out["document_suggestions"]}
