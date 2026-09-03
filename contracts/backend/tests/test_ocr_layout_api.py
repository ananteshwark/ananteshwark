"""The OCR layout endpoint the PDF viewer uses to shade scanned contracts."""
from app.database import SessionLocal
from app.models import Contract, ContractStatus, LifecycleStatus


def _contract(layout=None):
    db = SessionLocal()
    c = Contract(
        vendor_name_raw="ScanVendor", contract_service="svc",
        status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
        raw_extracted={}, confidence={}, ocr_layout=layout,
        extracted_text="The Vendor shall indemnify the Company without limit.",
    )
    db.add(c); db.commit()
    sr = c.sr_no
    db.close()
    return sr


LAYOUT = {
    "dpi": 300,
    "pages": [{"w": 2550, "h": 3300, "words": [
        {"t": "The", "x": 100, "y": 200, "w": 100, "h": 30},
        {"t": "Vendor", "x": 220, "y": 200, "w": 150, "h": 30},
    ]}],
}


def test_layout_is_returned_for_a_scanned_contract(client, admin_headers):
    sr = _contract(LAYOUT)
    r = client.get(f"/api/contracts/{sr}/ocr-layout", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available"] is True
    assert body["dpi"] == 300
    assert body["pages"][0]["words"][1]["t"] == "Vendor"


def test_absent_layout_reports_unavailable_rather_than_erroring(client, admin_headers):
    """A digital PDF, and any scan ingested before layouts were captured, has no
    layout. The viewer asks about every document with no text layer, so an error
    status for an expected answer would be noise in the console and the logs."""
    sr = _contract(None)
    r = client.get(f"/api/contracts/{sr}/ocr-layout", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"available": False}


def test_layout_survives_the_json_round_trip(client, admin_headers):
    """The column is declared JSON in both the model and the migration. Declared
    TEXT instead — a mistake this project has shipped before — it would come back
    as a string and the viewer would get characters where it expects words."""
    sr = _contract(LAYOUT)
    db = SessionLocal()
    stored = db.get(Contract, sr).ocr_layout
    db.close()
    assert isinstance(stored, dict), f"ocr_layout round-tripped as {type(stored).__name__}"
    assert isinstance(stored["pages"][0]["words"], list)


def test_requires_authentication(client):
    sr = _contract(LAYOUT)
    assert client.get(f"/api/contracts/{sr}/ocr-layout").status_code == 401
