"""R4 3.2: functional scale check — list + search over a larger dataset.

Not a hard latency benchmark (CI timing is noisy); it verifies pagination,
totals and text search stay correct as row counts grow. The trigram indexes in
migrations.py keep these queries fast on Postgres in production.
"""
import time
import uuid


def _seed(n, needle_token):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    try:
        for i in range(n):
            body = f"Standard agreement body {i}."
            if i == n // 2:
                body += f" Contains the {needle_token} marker."
            db.add(Contract(vendor_name_raw=f"ScaleVendor{i}", contract_service="svc",
                            status=ContractStatus.VALIDATED, raw_extracted={}, confidence={},
                            extracted_text=body))
        db.commit()
    finally:
        db.close()


def test_list_pagination_and_search_at_scale(client, admin_headers):
    token = f"scalemark{uuid.uuid4().hex[:6]}"
    _seed(400, token)

    # pagination: total reflects the dataset, page is bounded
    first = client.get("/api/contracts?limit=50", headers=admin_headers).json()
    assert first["total"] >= 400
    assert len(first["items"]) == 50

    # text search finds the single needle
    start = time.perf_counter()
    res = client.get(f"/api/contracts?q={token}&in_text=true", headers=admin_headers).json()
    elapsed = time.perf_counter() - start
    assert res["total"] == 1
    assert res["items"][0]["vendor_name"].startswith("ScaleVendor")
    # generous sanity bound (functional, not a strict benchmark)
    assert elapsed < 5.0
