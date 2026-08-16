"""Bulk re-extract action from the validation queue."""
from app.models import ContractStatus, IngestionStatus


def test_re_extract_skips_without_source(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract
    db = SessionLocal()
    c = Contract(vendor_name_raw="NoFile", contract_service="svc",
                 status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()

    r = client.post("/api/contracts/bulk", headers=admin_headers,
                    json={"sr_nos": [sr], "action": "re_extract"})
    assert r.status_code == 200
    body = r.json()
    assert body["updated_count"] == 0
    assert body["skipped"][0]["reason"] == "no source file to re-extract"


def test_re_extract_requeues_and_supersedes(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract, IngestionFile
    from app.services import extraction_worker as W
    db = SessionLocal()
    ing = IngestionFile(path="/tmp/x.pdf", filename="x.pdf", sha256="deadbeef" * 8,
                        status=IngestionStatus.EXTRACTED)
    db.add(ing); db.flush()
    c = Contract(vendor_name_raw="HasFile", contract_service="svc", ingestion_file_id=ing.id,
                 status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; iid = ing.id; db.close()

    before = W.extraction_queue.qsize()
    r = client.post("/api/contracts/bulk", headers=admin_headers,
                    json={"sr_nos": [sr], "action": "re_extract"})
    assert r.status_code == 200 and r.json()["updated_count"] == 1

    db = SessionLocal()
    # The pending contract is superseded (soft-deleted) and the file re-queued.
    assert db.get(Contract, sr).deleted_at is not None
    assert db.get(IngestionFile, iid).status == IngestionStatus.QUEUED
    db.close()
    assert W.extraction_queue.qsize() == before + 1
    # Drain the queued id so the worker (if running elsewhere) has nothing stale.
    try:
        while True:
            W.extraction_queue.get_nowait()
    except Exception:
        pass
