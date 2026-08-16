"""R3 2.13/2.14: clause text on the list, curated top-N with polished editable text."""


def _add(client, h, ctype, text, label=None):
    return client.post("/api/clauses/versions", headers=h,
                       json={"clause_type": ctype, "text": text, "label": label}).json()


def test_list_includes_clause_text(client, admin_headers):
    _add(client, admin_headers, "Termination", "Either party may terminate on 30 days notice.")
    rows = client.get("/api/clauses?clause_type=Termination", headers=admin_headers).json()
    assert rows and rows[0]["text"].startswith("Either party may terminate")


def test_curate_marks_top_and_polishes(client, admin_headers):
    variants = [
        "the supplier warrants the goods are free from defects in material and workmanship",
        "each product shall conform to its published specifications for twelve months",
        "services will be performed in a professional and workmanlike manner",
        "the vendor guarantees uninterrupted availability of the hosted platform",
        "all deliverables are warranted to comply with applicable statutory requirements",
        "spare parts remain available for a period of five years after delivery",
        "the licensor warrants it holds all rights necessary to grant this licence",
    ]
    for t in variants:
        _add(client, admin_headers, "Warranty", t)
    res = client.post("/api/clauses/curate", headers=admin_headers,
                      json={"clause_type": "Warranty"}).json()
    assert res["curated"] == 5 and res["polished"] == 5
    assert res["retired"] == 2   # 7 seeded, 2 beyond the top-5 retired

    # only 5 versions remain visible in the library for this clause type
    remaining = client.get("/api/clauses?clause_type=Warranty", headers=admin_headers).json()
    assert len(remaining) == 5

    curated = client.get("/api/clauses/curated?clause_type=Warranty", headers=admin_headers).json()
    assert len(curated) == 5
    ranks = [c["curated_rank"] for c in curated]
    assert ranks == [1, 2, 3, 4, 5]
    # polished text exists, is tidied (capitalized + terminal punctuation) and editable
    first = curated[0]
    assert first["polished_text"] and first["polished_text"][0].isupper()
    assert first["polished_text"].rstrip()[-1] in ".!?:;"


def test_polished_text_is_editable(client, admin_headers):
    v = _add(client, admin_headers, "Assignment", "neither party may assign without consent")
    client.post("/api/clauses/curate", headers=admin_headers, json={"clause_type": "Assignment"})
    edited = client.put(f"/api/clauses/versions/{v['id']}", headers=admin_headers,
                        json={"polished_text": "Neither party may assign this Agreement without prior written consent."}).json()
    assert edited["polished_text"].startswith("Neither party may assign this Agreement")


def test_curate_all_backfills_library(client, admin_headers):
    _add(client, admin_headers, "Governing Law", "This Agreement is governed by the laws of India.")
    res = client.post("/api/clauses/curate", headers=admin_headers, json={}).json()
    # whole-library curation touches every clause type seeded above
    assert res["entries"] >= 1 and res["curated"] >= 1


def test_autolearn_keeps_clause_capped_at_five(client, admin_headers):
    """Validating contracts that each add a distinct Indemnity variant never grows
    the Indemnity clause beyond 5 visible versions."""
    from datetime import date, timedelta
    import uuid
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus, Department

    variants = [
        "The vendor shall indemnify the company against third-party IP claims.",
        "The supplier indemnifies the buyer for personal injury and property damage.",
        "Each party indemnifies the other for its own negligence and wilful misconduct.",
        "The contractor shall hold harmless the client from regulatory penalties.",
        "The vendor indemnifies the company for data-protection breaches it causes.",
        "The seller indemnifies the purchaser against defective-product liability.",
        "The licensor indemnifies the licensee for infringement of the licensed marks.",
    ]
    db = SessionLocal()
    dept = Department(name=f"CapDept-{uuid.uuid4().hex[:6]}"); db.add(dept); db.flush()
    srs = []
    for i, text in enumerate(variants):
        c = Contract(signing_entity="Inventurus", vendor_name_raw=f"CapV{i}",
                     start_date=date.today(), end_date=date.today() + timedelta(days=365),
                     department_id=dept.id, contract_service="svc", po_number=f"PO-CAP-{i}",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={},
                     extracted_text=f"1. Indemnity. {text}")
        db.add(c); db.flush(); srs.append(c.sr_no)
    db.commit(); db.close()

    for sr in srs:
        client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})

    rows = client.get("/api/clauses?clause_type=Indemnity", headers=admin_headers).json()
    indemnity = [r for r in rows if r["clause_type"] == "Indemnity"]
    assert len(indemnity) <= 5
