"""Renew: roll the term forward + rebuild the document from the original text."""
from datetime import date

from app.services import authoring


def test_renewal_rolls_dates_forward():
    class C:
        signing_entity = "Inventurus"; vendor = None; vendor_name_raw = "V"; vendor_address = None
        vendor_address = None; start_date = date(2025, 1, 1); end_date = date(2025, 12, 31)
        contract_tenure = "12 months"; department = None; po_number = "PO-1"
        contract_value = 100000; currency = "INR"; iks_signing_authority = "A"
        vendor_signing_authority = "B"; contract_service = "svc"; service_summary = None
        payment_term = "Net 30"; notice_period = "30 days"; contract_type = "MSA"
    f = authoring.renewal_fields_from_contract(C())
    # new term starts the day after the old end and keeps the 12-month tenure
    assert f["start_date"] == "2026-01-01"
    assert f["end_date"] == "2026-12-31"
    assert f["contract_tenure"]
    # one-off values are cleared, service/vendor retained
    assert f["po_number"] is None and f["contract_value"] is None
    assert f["iks_signing_authority"] is None and f["vendor_signing_authority"] is None
    assert f["contract_service"] == "svc"


def test_document_from_text_structure():
    text = ("MASTER SERVICES AGREEMENT\n\n"
            "1. Term\nThis Agreement runs for twelve months.\n\n"
            "Deliverables include:\n- design\n- build\n- support")
    doc = authoring.document_from_text(text)
    types = [b["type"] for b in doc["content"]]
    assert "heading" in types and "paragraph" in types and "bulletList" in types
    # the bullet list has three items
    blist = next(b for b in doc["content"] if b["type"] == "bulletList")
    assert len(blist["content"]) == 3


def test_renew_endpoint_opens_editable_draft(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw="RenewVendor", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={},
                 start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
                 contract_tenure="12 months", contract_type="MSA",
                 extracted_text="1. Scope\nThe vendor shall provide managed services.")
    db.add(c); db.commit(); sr = c.sr_no; db.close()

    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "duplicate", "source_contract_id": sr, "link_as": "renewal"}).json()
    detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
    assert detail["fields"]["start_date"] == "2026-01-01"
    assert detail["fields"]["end_date"] == "2026-12-31"
    assert detail["link_as"] == "renewal" and detail["renews_contract_id"] == sr
    # the document carries the original content, not a blank scaffold
    body = "".join(t.get("text", "") for b in detail["document"]["content"]
                   for t in (b.get("content") or []) if t.get("type") == "text")
    assert "managed services" in body
